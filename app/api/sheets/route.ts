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

function parseMonthTab(monthStr: string): string {
  // Converte "2026-08" para "AGOSTO-26"
  const months: Record<string, string> = {
    '01': 'JAN-26', '02': 'FEV-26', '03': 'MAR-26', '04': 'ABRIL',
    '05': 'MAIO-26', '06': 'JUNHO-26', '07': 'JULHO-26', '08': 'AGOSTO-26',
    '09': 'SET-26', '10': 'OUT-26', '11': 'NOV-26', '12': 'DEZ-26'
  };
  const [year, month] = monthStr.split('-');
  return months[month] || `${month}-${year.slice(2)}`;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || '2026-08';
    
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    
    const tabName = parseMonthTab(month);
    
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
