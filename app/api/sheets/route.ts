import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { readFileSync } from 'fs';

function getAuth() {
  const credPath = process.env.GOOGLE_CREDENTIALS_PATH || '/app/google-credentials.json';
  const credentials = JSON.parse(readFileSync(credPath, 'utf-8'));
  
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  
  return auth;
}

// As abas da planilha não seguem um padrão único: convivem "MAR-26",
// "SETEMBRO-26", "AGOSTO/2025", " SET/24", "NOV/23.", "ABRIL" (sem ano) e
// até erros de digitação ("BR/24" = abril, "FER/24" = fevereiro). Por isso
// lemos os nomes reais da planilha e interpretamos cada um, em vez de manter
// uma lista fixa no código.
const MONTH_TOKENS: Record<string, number> = {
  JAN: 1, FEV: 2, FER: 2, MAR: 3, ABR: 4, BR: 4, MAI: 5, JUN: 6,
  JUL: 7, AGO: 8, AGOS: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12,
};

function normalizar(texto: string): string {
  return texto
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // tira acentos
    .toUpperCase()
    .replace(/[.\s]+$/g, '')  // ponto/espaço no fim
    .trim();
}

// Extrai mês e ano do nome de uma aba. Ano null = aba sem ano (ex: "ABRIL").
export function interpretarAba(titulo: string): { mes: number; ano: number | null } | null {
  const t = normalizar(titulo);
  if (!t || /^(ACUMULADO|HISTORICO|RESUMO|TOTAL)/.test(t)) return null;

  const partes = t.split(/[-\/]/).map((p) => p.trim()).filter(Boolean);
  if (partes.length === 0) return null;

  // mês: casa pelo prefixo mais longo (AGOS antes de AGO)
  const nomeMes = partes[0].replace(/[^A-Z]/g, '');
  let mes: number | null = null;
  for (const token of Object.keys(MONTH_TOKENS).sort((a, b) => b.length - a.length)) {
    if (nomeMes.startsWith(token)) { mes = MONTH_TOKENS[token]; break; }
  }
  if (!mes) return null;

  // ano: 2 dígitos viram 20xx, 4 dígitos vão como estão
  let ano: number | null = null;
  if (partes[1]) {
    const digitos = partes[1].replace(/\D/g, '');
    if (digitos.length === 2) ano = 2000 + Number(digitos);
    else if (digitos.length === 4) ano = Number(digitos);
  }
  return { mes, ano };
}

async function listarAbas(sheets: any, spreadsheetId: string): Promise<string[]> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
  return (meta.data.sheets || []).map((s: any) => s.properties.title as string);
}

// Encontra a aba correspondente a "2026-11". Prioriza quem tem o ano certo;
// abas sem ano ("ABRIL") entram só como último recurso.
function acharAba(titulos: string[], monthStr: string): string | null {
  const [anoAlvo, mesAlvo] = monthStr.split('-').map(Number);
  let semAno: string | null = null;
  for (const titulo of titulos) {
    const info = interpretarAba(titulo);
    if (!info || info.mes !== mesAlvo) continue;
    if (info.ano === anoAlvo) return titulo;
    if (info.ano === null && !semAno) semAno = titulo;
  }
  return semAno;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || '2026-08';
    
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    const titulos = await listarAbas(sheets, spreadsheetId!);

    // ?action=months — lista os meses que existem de fato na planilha
    if (searchParams.get('action') === 'months') {
      const meses = titulos
        .map((titulo) => ({ titulo, info: interpretarAba(titulo) }))
        .filter((x) => x.info && x.info.ano !== null)
        .map((x) => ({
          value: `${x.info!.ano}-${String(x.info!.mes).padStart(2, '0')}`,
          aba: x.titulo,
        }));
      // abas sem ano só entram se aquele mês não tiver outra aba equivalente
      for (const { titulo, info } of titulos.map((t) => ({ titulo: t, info: interpretarAba(t) }))) {
        if (!info || info.ano !== null) continue;
        const ehUnica = !meses.some((m) => Number(m.value.split('-')[1]) === info.mes);
        if (ehUnica) meses.push({ value: `${new Date().getFullYear()}-${String(info.mes).padStart(2, '0')}`, aba: titulo });
      }
      const unicos = Array.from(new Map(meses.map((m) => [m.value, m])).values())
        .sort((a, b) => b.value.localeCompare(a.value));
      return NextResponse.json({ meses: unicos });
    }

    const tabName = acharAba(titulos, month);
    if (!tabName) {
      return NextResponse.json(
        { error: `Não existe aba para ${month} nesta planilha`, vendas: [], resumo: {} },
        { status: 404 }
      );
    }

    // Buscar dados da aba do mês
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${tabName}'!A:P`,
    });
    
    const rows = response.data.values || [];
    if (rows.length < 2) {
      return NextResponse.json({ vendas: [], resumo: {} });
    }
    
    // Primeira linha é header
    const headers = rows[0];
    const dataRows = rows.slice(1).filter(row => row[0] && row[1]); // Filtrar linhas vazias
    
    // Processar vendas
    const vendas = dataRows.map(row => ({
      data: row[0] || '',
      vendedor: row[1] || '',
      origem: row[2] || '',
      anuncio: row[3] || '',
      base: row[4] || '',
      produto: row[5] || '',
      valor: parseFloat((row[6] || '0').toString().replace(/[R$\s.]/g, '').replace(',', '.')) || 0,
      frete: parseFloat((row[7] || '0').toString().replace(/[R$\s.]/g, '').replace(',', '.')) || 0,
      pagamento: row[8] || '',
      cliente: row[9] || '',
      telefone: row[10] || '',
      sistema: row[13] || '',
      custo: parseFloat((row[14] || '0').toString().replace(/[R$\s.]/g, '').replace(',', '.')) || 0,
      hora: row[11] || '',
    }));
    
    // Calcular resumo por vendedor
    const vendedores: Record<string, { total: number; custo: number; qtd: number; dias: Set<string> }> = {};
    
    vendas.forEach(v => {
      if (!vendedores[v.vendedor]) {
        vendedores[v.vendedor] = { total: 0, custo: 0, qtd: 0, dias: new Set() };
      }
      vendedores[v.vendedor].total += v.valor;
      vendedores[v.vendedor].custo += v.custo;
      vendedores[v.vendedor].qtd += 1;
      if (v.data) vendedores[v.vendedor].dias.add(v.data);
    });
    
    // Calcular evolução diária
    const evolucaoDiaria: Record<string, number> = {};
    vendas.forEach(v => {
      if (v.data) {
        evolucaoDiaria[v.data] = (evolucaoDiaria[v.data] || 0) + v.valor;
      }
    });
    
    // Ordenar por data e calcular acumulado
    const diasOrdenados = Object.keys(evolucaoDiaria).sort((a, b) => {
      const [dA, mA] = a.split('/').map(Number);
      const [dB, mB] = b.split('/').map(Number);
      if (mA !== mB) return mA - mB;
      return dA - dB;
    });
    
    let acumulado = 0;
    const evolucaoAcumulada = diasOrdenados.map(dia => {
      acumulado += evolucaoDiaria[dia];
      return { dia, valor: acumulado, valorDia: evolucaoDiaria[dia] };
    });
    
    // Resumo geral
    const totalVendas = vendas.reduce((acc, v) => acc + v.valor, 0);
    const totalCusto = vendas.reduce((acc, v) => acc + v.custo, 0);
    const totalQtd = vendas.length;
    const ticketMedio = totalQtd > 0 ? totalVendas / totalQtd : 0;
    
    // Resumo por vendedor
    const resumoVendedores = Object.entries(vendedores).map(([nome, data]) => ({
      nome,
      totalVendas: data.total,
      totalCusto: data.custo,
      lucro: data.total - data.custo,
      margemLucro: data.total > 0 ? ((data.total - data.custo) / data.total) * 100 : 0,
      qtdVendas: data.qtd,
      ticketMedio: data.qtd > 0 ? data.total / data.qtd : 0,
      diasAtivos: data.dias.size,
    }));
    
    return NextResponse.json({
      mes: tabName,
      totalVendas,
      totalCusto,
      lucroTotal: totalVendas - totalCusto,
      margemLucroGeral: totalVendas > 0 ? ((totalVendas - totalCusto) / totalVendas) * 100 : 0,
      ticketMedio,
      qtdVendas: totalQtd,
      vendedores: resumoVendedores,
      evolucaoAcumulada,
      ultimasVendas: vendas.reverse().map(v => ({ data: v.data, hora: v.hora, vendedor: v.vendedor, produto: v.produto, valor: v.valor, cliente: v.cliente, origem: v.origem, pagamento: v.pagamento, custo: v.custo })),
      diasNoMes: diasOrdenados.length,
    });
    
  } catch (error: any) {
    console.error('Erro ao buscar dados do Sheets:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar dados da planilha', details: error.message },
      { status: 500 }
    );
  }
}
