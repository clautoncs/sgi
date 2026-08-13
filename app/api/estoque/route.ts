import { NextResponse } from "next/server";
import { google } from "googleapis";
import { readFileSync } from "fs";

function getAuth() {
  const credPath = process.env.GOOGLE_CREDENTIALS_PATH || "/app/google-credentials.json";
  const credentials = JSON.parse(readFileSync(credPath, "utf-8"));
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

const SHEET_ID = "1o-AtrxDoSzDjOwNt_UIsbe5vtFrgSDLywd1a7nxI22U";

function parseNumber(val: any): number {
  if (!val) return 0;
  const str = String(val).replace("R$", "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
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
  if (!val) return "";
  return String(val).replace(/^\*|\*$/g, "").replace(/💻|✅|❗|🔴|🟡|🟢/g, "").trim();
}

// COMPUTADORES: Row2=header, dados a partir de Row3
// idx1=QTD, idx3=MODELO, idx4=MODALIDADE, idx5=CHASSI, idx6=PROCESSADOR, idx7=MEMÓRIA, idx8=SSD, idx9=VIDEO, idx10=VALOR
// idx13=FOTOS (URL), idx15=REVENDA, idx17=CUSTO, idx21=STATUS
function parseComputadores(rows: any[][]): any[] {
  return rows.slice(2).filter(row => row[1] && parseInt(row[1]) > 0).map((row, idx) => ({
    id: `comp-${idx}`,
    categoria: "COMPUTADOR",
    quantidade: parseInt(row[1]) || 0,
    modelo: cleanText(row[3]),
    modalidade: cleanText(row[4]),
    chassi: cleanText(row[5]),
    processador: cleanText(row[6]),
    memoria: cleanText(row[7]),
    ssd: cleanText(row[8]),
    video: cleanText(row[9]),
    valor: parseNumber(row[10]),
    foto: cleanFoto(row[13]),
    custo: parseNumber(row[17]),
    revenda: parseNumber(row[15]),
    status: cleanText(row[21]),
  }));
}

// NOTEBOOKS: Row2=header, dados a partir de Row3
// idx1=QTD, idx3=MODELO, idx4=PROCESSADOR, idx5=VIDEO, idx6=SIZE, idx7=MEM, idx8=SSD, idx9=RESOL, idx10=VALOR
// idx12=LINK DAS FOTOS, idx14=REVENDA, idx18=CUSTO, idx21=STATUS
function parseNotebooks(rows: any[][]): any[] {
  return rows.slice(2).filter(row => row[1] && parseInt(row[1]) > 0).map((row, idx) => ({
    id: `note-${idx}`,
    categoria: "NOTEBOOK",
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
    status: cleanText(row[21]),
  }));
}

// MONITORES: Row2=header, dados a partir de Row3
// idx1=QTD, idx3=MARCA/MODELO, idx4=ESTADO, idx5=TAMANHO, idx6=RESOLUÇÃO, idx8=TECNOLOGIA, idx9=FREQUÊNCIA
// idx10=INTERFACE, idx13=PÉ, idx16=VALOR, idx18=FOTOS (URL), idx20=REVENDA, idx23=CUSTO, idx25=STATUS
function parseMonitores(rows: any[][]): any[] {
  return rows.slice(2).filter(row => row[1] && parseInt(row[1]) > 0).map((row, idx) => ({
    id: `mon-${idx}`,
    categoria: "MONITOR",
    quantidade: parseInt(row[1]) || 0,
    modelo: cleanText(row[3]),
    estado: cleanText(row[4]),
    tamanho: cleanText(row[5]),
    resolucao: cleanText(row[6]),
    tecnologia: cleanText(row[8]),
    frequencia: cleanText(row[9]),
    interface_: cleanText(row[10]),
    pe: cleanText(row[13]),
    valor: parseNumber(row[16]),
    foto: cleanFoto(row[18]),
    revenda: parseNumber(row[20]),
    custo: parseNumber(row[23]),
    status: cleanText(row[25]),
  }));
}

// COMPONENTES: Row2=header, dados a partir de Row3
// idx1=QTD, idx3=PRODUTO, idx4=VALOR, idx5=FOTOS (placeholder, sem URLs reais), idx8=REVENDA, idx9=CUSTO, idx13=STATUS
function parseComponentes(rows: any[][]): any[] {
  return rows.slice(2).filter(row => row[1] && parseInt(row[1]) > 0).map((row, idx) => ({
    id: `comp-item-${idx}`,
    categoria: "COMPONENTE",
    quantidade: parseInt(row[1]) || 0,
    produto: cleanText(row[3]),
    valor: parseNumber(row[4]),
    foto: cleanFoto(row[5]),
    revenda: parseNumber(row[8]),
    custo: parseNumber(row[9]),
    status: cleanText(row[13]),
  }));
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const categoria = searchParams.get("categoria");

    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });

    const ranges = [];
    if (!categoria || categoria === "COMPUTADOR") ranges.push("COMPUTADORES!A1:W200");
    if (!categoria || categoria === "NOTEBOOK") ranges.push("NOTEBOOKS!A1:V50");
    if (!categoria || categoria === "MONITOR") ranges.push("MONITORES!A1:Z50");
    if (!categoria || categoria === "COMPONENTE") ranges.push("COMPONENTES!A1:N200");

    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: SHEET_ID,
      ranges,
    });

    const valueRanges = response.data.valueRanges || [];
    let produtos: any[] = [];

    for (const vr of valueRanges) {
      const range = vr.range || "";
      const rows = vr.values || [];
      if (range.includes("COMPUTADORES")) {
        produtos = [...produtos, ...parseComputadores(rows)];
      } else if (range.includes("NOTEBOOKS")) {
        produtos = [...produtos, ...parseNotebooks(rows)];
      } else if (range.includes("MONITORES")) {
        produtos = [...produtos, ...parseMonitores(rows)];
      } else if (range.includes("COMPONENTES")) {
        produtos = [...produtos, ...parseComponentes(rows)];
      }
    }

    // Filtrar apenas itens com quantidade > 0 e valor > 0
    produtos = produtos.filter(p => p.quantidade > 0 && p.valor > 0);

    // Ordenar alfabeticamente pelo nome
    produtos.sort((a, b) => {
      const nomeA = a.modelo || a.produto || "";
      const nomeB = b.modelo || b.produto || "";
      return nomeA.localeCompare(nomeB);
    });

    // Resumo
    const resumo = {
      totalItens: produtos.length,
      totalUnidades: produtos.reduce((acc: number, p: any) => acc + p.quantidade, 0),
      valorTotalEstoque: produtos.reduce((acc: number, p: any) => acc + (p.valor * p.quantidade), 0),
      porCategoria: {
        computadores: produtos.filter(p => p.categoria === "COMPUTADOR").length,
        notebooks: produtos.filter(p => p.categoria === "NOTEBOOK").length,
        monitores: produtos.filter(p => p.categoria === "MONITOR").length,
        componentes: produtos.filter(p => p.categoria === "COMPONENTE").length,
      },
    };

    return NextResponse.json({ produtos, resumo });
  } catch (error: any) {
    console.error("Erro ao buscar estoque:", error);
    return NextResponse.json(
      { error: "Erro ao buscar dados do estoque", details: error.message },
      { status: 500 }
    );
  }
}
