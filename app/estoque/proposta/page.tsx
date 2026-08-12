'use client';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, Suspense } from 'react';
import './proposta.css';

interface ItemProposta {
  nome: string;
  descricao: string;
  quantidade: number;
  valorUnit: number;
  subtotal: number;
}

interface DadosProposta {
  itens: ItemProposta[];
  total: number;
  perfil: string;
}

function PropostaContent() {
  const searchParams = useSearchParams();
  const printRef = useRef<HTMLDivElement>(null);
  
  let dados: DadosProposta | null = null;
  try {
    const raw = searchParams.get('dados');
    if (raw) dados = JSON.parse(decodeURIComponent(raw));
  } catch (e) {
    console.error('Erro ao parsear dados:', e);
  }

  useEffect(() => {
    // Auto-print quando carrega
    const timer = setTimeout(() => {
      window.print();
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  function formatCurrency(val: number): string {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  if (!dados) {
    return <div className="proposta-erro">Erro: dados da proposta não encontrados.</div>;
  }

  const hoje = new Date();
  const dataFormatada = hoje.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const numProposta = `${hoje.getFullYear()}${String(hoje.getMonth()+1).padStart(2,'0')}${String(hoje.getDate()).padStart(2,'0')}${String(hoje.getHours()).padStart(2,'0')}${String(hoje.getMinutes()).padStart(2,'0')}`;

  return (
    <div className="proposta-container" ref={printRef}>
      {/* Cabeçalho */}
      <header className="proposta-header">
        <div className="proposta-logo">
          <h1>PCBH Informática</h1>
          <p>Soluções em Tecnologia</p>
        </div>
        <div className="proposta-empresa-info">
          <p>R. Malaga, 53 - Contagem/MG</p>
          <p>CNPJ: XX.XXX.XXX/0001-XX</p>
          <p>contato@pcbh.com.br</p>
        </div>
      </header>

      {/* Título */}
      <div className="proposta-titulo">
        <h2>PROPOSTA COMERCIAL</h2>
        <div className="proposta-meta">
          <span>N° {numProposta}</span>
          <span>Data: {dataFormatada}</span>
          <span>Tipo: {dados.perfil === 'revenda' ? 'Revenda' : 'Varejo'}</span>
        </div>
      </div>

      {/* Tabela de Itens */}
      <table className="proposta-tabela">
        <thead>
          <tr>
            <th>#</th>
            <th>Produto</th>
            <th>Qtd</th>
            <th>Valor Unit.</th>
            <th>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {dados.itens.map((item, idx) => (
            <tr key={idx}>
              <td>{idx + 1}</td>
              <td>
                <strong>{item.nome}</strong>
                {item.descricao && <br />}
                {item.descricao && <small>{item.descricao}</small>}
              </td>
              <td>{item.quantidade}</td>
              <td>{formatCurrency(item.valorUnit)}</td>
              <td>{formatCurrency(item.subtotal)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4}><strong>TOTAL</strong></td>
            <td><strong>{formatCurrency(dados.total)}</strong></td>
          </tr>
        </tfoot>
      </table>

      {/* Condições */}
      <div className="proposta-condicoes">
        <h3>Condições Comerciais</h3>
        <ul>
          <li>Proposta válida por 3 (três) dias úteis.</li>
          <li>Sujeito à disponibilidade de estoque.</li>
          <li>Pagamento: PIX, cartão de débito/crédito ou boleto.</li>
          <li>Garantia conforme fabricante.</li>
        </ul>
      </div>

      {/* Rodapé */}
      <footer className="proposta-footer">
        <p>PCBH Informática - R. Malaga, 53 - Contagem/MG</p>
        <p>Documento gerado em {dataFormatada} pelo SGI iLinked</p>
      </footer>

      {/* Botão de impressão (não aparece na impressão) */}
      <div className="proposta-acoes no-print">
        <button onClick={() => window.print()}>🖨️ Imprimir / Salvar PDF</button>
        <button onClick={() => window.close()}>✕ Fechar</button>
      </div>
    </div>
  );
}

export default function PropostaPage() {
  return (
    <Suspense fallback={<div className="proposta-loading">Carregando proposta...</div>}>
      <PropostaContent />
    </Suspense>
  );
}
