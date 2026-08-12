import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { readFileSync } from 'fs';

function getAuth() {
  const credPath = process.env.GOOGLE_CREDENTIALS_PATH || '/app/google-credentials.json';
  const credentials = JSON.parse(readFileSync(credPath, 'utf-8'));
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
}

const SHEET_ID = '1o-AtrxDoSzDjOwNt_UIsbe5vtFrgSDLywd1a7nxI22U';

function parseNumber(val: any): number {
  if (!val) return 0;
  const str = String(val).replace('R$', '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

function cleanFoto(val: any): string {
  if (!val) return "";
  const str = String(val).trim();
  if (str.startsWith("http")) return str;
  if (str.includes("google.com") || str.includes("goo.gl")) return str;
  return "";
}
function cleanText(val: any): string {
  if (!val) return '';
  return String(val).replace(/^\*|\*$/g, '').replace(/💻|✅|❗|🔴|🟡|🟢/g, '').trim();
}

// COMPUTADORES: idx1=QTD, idx3=MODELO, idx4=MODALIDADE, idx5=CHASSI, idx6=PROCESSADOR, idx7=MEMORIA, idx8=SSD, idx9=VIDEO, idx10=VALOR, idx12=FOTOS, idx15=CUSTO
function parseComputadores(rows: any[][]): any[] {
  // Skip first 2 rows (empty + header)
  return rows.slice(2).filter(row => row[1] && parseInt(row[1]) > 0).map((row, idx) => ({
    id: `comp-${idx}`,
    categoria: 'COMPUTADOR',
    quantidade: parseInt(row[1]) || 0,
    modelo: cleanText(row[3]),
    modalidade: cleanText(row[4]),
    chassi: cleanText(row[5]),
    processador: cleanText(row[6]),
    memoria: cleanText(row[7]),
    ssd: cleanText(row[8]),
    video: cleanText(row[9]),
    valor: parseNumber(row[10]),
    foto: cleanFoto(row[12]),
    custo: parseNumber(row[15]),
    revenda: parseNumber(row[15]) * 1.3, // 30% margem revenda
    status: cleanText(row[14]),
  }));
}

// NOTEBOOKS: idx1=QTD, idx3=MODELO, idx4=PROCESSADOR, idx5=VIDEO, idx6=SIZE, idx7=MEM, idx8=SSD, idx9=RES, idx10=VALOR, idx12=FOTO_URL, idx14=REVENDA, idx18=CUSTO
function parseNotebooks(rows: any[][]): any[] {
  return rows.slice(2).filter(row => row[1] && parseInt(row[1]) > 0).map((row, idx) => ({
    id: `note-${idx}`,
    categoria: 'NOTEBOOK',
    quantidade: parseInt(row[1]) || 0,
    modelo: cleanText(row[3]),
    processador: cleanText(row[4]),
    video: cleanText(row[5]),
    tamanho: cleanText(row[6]),
    memoria: cleanText(row[7]),
    ssd: cleanText(row[8]),
    resolucao: cleanText(row[9]),
    valor: parseNumber(row[10]),
    foto: cleanFoto(row[12]),
    revenda: parseNumber(row[14]),
    custo: parseNumber(row[18]),
    status: cleanText(row[13]),
  }));
}

// MONITORES: idx1=QTD, idx3=MODELO, idx4=ESTADO, idx5=TAMANHO, idx6=RESOL, idx7=TECNOLOGIA, idx9=FREQUENCIA, idx10=INTERFACE, idx13=PE, idx16=VALOR, idx17=FOTOS, idx19=STATUS, idx20=CUSTO
function parseMonitores(rows: any[][]): any[] {
  return rows.slice(2).filter(row => row[1] && parseInt(row[1]) > 0).map((row, idx) => ({
    id: `mon-${idx}`,
    categoria: 'MONITOR',
    quantidade: parseInt(row[1]) || 0,
    modelo: cleanText(row[3]),
    estado: cleanText(row[4]),
    tamanho: cleanText(row[5]),
    resolucao: cleanText(row[6]),
    tecnologia: cleanText(row[7]),
    frequencia: cleanText(row[9]),
    interface_: cleanText(row[10]),
    pe: cleanText(row[13]),
    valor: parseNumber(row[16]),
    foto: cleanFoto(row[17]),
    revenda: parseNumber(row[20]) * 1.3,
    custo: parseNumber(row[20]),
    status: cleanText(row[19]),
  }));
}

// COMPONENTES: idx1=QTD, idx3=PRODUTO, idx4=VALOR, idx5=FOTOS, idx8=REVENDA, idx9=CUSTO
function parseComponentes(rows: any[][]): any[] {
  return rows.slice(2).filter(row => row[1] && parseInt(row[1]) > 0).map((row, idx) => ({
    id: `comp-item-${idx}`,
    categoria: 'COMPONENTE',
    quantidade: parseInt(row[1]) || 0,
    produto: cleanText(row[3]),
    valor: parseNumber(row[4]),
    foto: cleanFoto(row[5]),
    revenda: parseNumber(row[8]),
    custo: parseNumber(row[9]),
    status: cleanText(row[7]),
  }));
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const categoria = searchParams.get('categoria');
    
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    
    const ranges = [];
    if (!categoria || categoria === 'COMPUTADOR') ranges.push('COMPUTADORES!A1:Q200');
    if (!categoria || categoria === 'NOTEBOOK') ranges.push('NOTEBOOKS!A1:S50');
    if (!categoria || categoria === 'MONITOR') ranges.push('MONITORES!A1:U50');
    if (!categoria || categoria === 'COMPONENTE') ranges.push('COMPONENTES!A1:K200');
    
    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: SHEET_ID,
      ranges,
    });
    
    const valueRanges = response.data.valueRanges || [];
    let produtos: any[] = [];
    
    for (const vr of valueRanges) {
      const range = vr.range || '';
      const rows = vr.values || [];
      
      if (range.includes('COMPUTADORES')) {
        produtos = [...produtos, ...parseComputadores(rows)];
      } else if (range.includes('NOTEBOOKS')) {
        produtos = [...produtos, ...parseNotebooks(rows)];
      } else if (range.includes('MONITORES')) {
        produtos = [...produtos, ...parseMonitores(rows)];
      } else if (range.includes('COMPONENTES')) {
        produtos = [...produtos, ...parseComponentes(rows)];
      }
    }
    
    // Filtrar apenas itens com quantidade > 0 e valor > 0
    produtos = produtos.filter(p => p.quantidade > 0 && p.valor > 0);
    
    // Ordenar alfabeticamente pelo nome
    produtos.sort((a, b) => {
      const nomeA = a.modelo || a.produto || '';
      const nomeB = b.modelo || b.produto || '';
      return nomeA.localeCompare(nomeB);
    });
    
    // Resumo
    const resumo = {
      totalItens: produtos.length,
      totalUnidades: produtos.reduce((acc: number, p: any) => acc + p.quantidade, 0),
      valorTotalEstoque: produtos.reduce((acc: number, p: any) => acc + (p.valor * p.quantidade), 0),
      porCategoria: {
        computadores: produtos.filter(p => p.categoria === 'COMPUTADOR').length,
        notebooks: produtos.filter(p => p.categoria === 'NOTEBOOK').length,
        monitores: produtos.filter(p => p.categoria === 'MONITOR').length,
        componentes: produtos.filter(p => p.categoria === 'COMPONENTE').length,
      }
    };
    
    return NextResponse.json({ produtos, resumo });
  } catch (error: any) {
    console.error('Erro ao buscar estoque:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar dados do estoque', details: error.message },
      { status: 500 }
    );
  }
}
