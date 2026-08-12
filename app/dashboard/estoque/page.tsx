'use client';
import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './estoque.css';

interface Produto {
  id: string;
  categoria: 'COMPUTADOR' | 'NOTEBOOK' | 'MONITOR' | 'COMPONENTE';
  quantidade: number;
  valor: number;
  revenda: number;
  custo: number;
  foto: string;
  status: string;
  // Computador
  modelo?: string;
  modalidade?: string;
  chassi?: string;
  processador?: string;
  memoria?: string;
  ssd?: string;
  video?: string;
  // Notebook
  tamanho?: string;
  resolucao?: string;
  // Monitor
  estado?: string;
  tecnologia?: string;
  frequencia?: string;
  interface_?: string;
  pe?: string;
  // Componente
  produto?: string;
}

interface ItemCarrinho {
  produto: Produto;
  quantidade: number;
}

type Perfil = 'prateleira' | 'revenda' | 'vendedor';

export default function EstoquePage() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [categoriaAtiva, setCategoriaAtiva] = useState<string>('TODOS');
  const [perfil, setPerfil] = useState<Perfil>('prateleira');
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [carrinhoAberto, setCarrinhoAberto] = useState(false);
  const [produtoExpandido, setProdutoExpandido] = useState<string | null>(null);

  useEffect(() => {
    fetchEstoque();
  }, []);

  async function fetchEstoque() {
    try {
      setLoading(true);
      const res = await fetch('/api/estoque');
      const data = await res.json();
      setProdutos(data.produtos || []);
    } catch (err) {
      console.error('Erro ao buscar estoque:', err);
    } finally {
      setLoading(false);
    }
  }

  const produtosFiltrados = useMemo(() => {
    let filtered = produtos;
    
    if (categoriaAtiva !== 'TODOS') {
      filtered = filtered.filter(p => p.categoria === categoriaAtiva);
    }
    
    if (busca.trim()) {
      const termo = busca.toLowerCase();
      filtered = filtered.filter(p => {
        const nome = getNomeProduto(p).toLowerCase();
        const proc = (p.processador || '').toLowerCase();
        const mem = (p.memoria || '').toLowerCase();
        const ssd = (p.ssd || '').toLowerCase();
        return nome.includes(termo) || proc.includes(termo) || mem.includes(termo) || ssd.includes(termo);
      });
    }
    
    return filtered;
  }, [produtos, categoriaAtiva, busca]);

  function getNomeProduto(p: Produto): string {
    if (p.categoria === 'COMPONENTE') return p.produto || 'Componente';
    return p.modelo || 'Produto';
  }

  function getDescricaoProduto(p: Produto): string {
    if (p.categoria === 'COMPUTADOR') {
      return [p.processador, p.memoria, p.ssd, p.video].filter(Boolean).join(' | ');
    }
    if (p.categoria === 'NOTEBOOK') {
      return [p.tamanho, p.processador, p.memoria, p.ssd, p.resolucao].filter(Boolean).join(' | ');
    }
    if (p.categoria === 'MONITOR') {
      return [p.tamanho, p.resolucao, p.tecnologia, p.frequencia, p.interface_].filter(Boolean).join(' | ');
    }
    return '';
  }

  function getPreco(p: Produto): number {
    if (perfil === 'revenda') return p.revenda || p.valor;
    return p.valor;
  }

  function formatCurrency(val: number): string {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function adicionarAoCarrinho(p: Produto) {
    setCarrinho(prev => {
      const existente = prev.find(item => item.produto.id === p.id);
      if (existente) {
        return prev.map(item => 
          item.produto.id === p.id 
            ? { ...item, quantidade: Math.min(item.quantidade + 1, p.quantidade) }
            : item
        );
      }
      return [...prev, { produto: p, quantidade: 1 }];
    });
  }

  function removerDoCarrinho(id: string) {
    setCarrinho(prev => prev.filter(item => item.produto.id !== id));
  }

  function alterarQuantidadeCarrinho(id: string, qtd: number) {
    if (qtd <= 0) {
      removerDoCarrinho(id);
      return;
    }
    setCarrinho(prev => prev.map(item => 
      item.produto.id === id ? { ...item, quantidade: qtd } : item
    ));
  }

  function totalCarrinho(): number {
    return carrinho.reduce((acc, item) => acc + (getPreco(item.produto) * item.quantidade), 0);
  }

  function gerarTextoWhatsApp(): string {
    let texto = `*PROPOSTA COMERCIAL - PCBH Informática*\n`;
    texto += `R. Malaga, 53 - Contagem/MG\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    carrinho.forEach((item, idx) => {
      const nome = getNomeProduto(item.produto);
      const desc = getDescricaoProduto(item.produto);
      const preco = getPreco(item.produto);
      texto += `*${idx + 1}. ${nome}*\n`;
      if (desc) texto += `   ${desc}\n`;
      texto += `   Qtd: ${item.quantidade} | Valor unit.: ${formatCurrency(preco)}\n`;
      texto += `   *Subtotal: ${formatCurrency(preco * item.quantidade)}*\n\n`;
    });
    
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `*TOTAL: ${formatCurrency(totalCarrinho())}*\n\n`;
    texto += `_Proposta válida por 3 dias úteis._\n`;
    texto += `_Sujeito à disponibilidade de estoque._`;
    
    return texto;
  }

  function enviarWhatsApp() {
    const texto = gerarTextoWhatsApp();
    const url = `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.open(url, '_blank');
  }

  function gerarPDF() {
    // Gera um PDF via API
    const dados = {
      itens: carrinho.map(item => ({
        nome: getNomeProduto(item.produto),
        descricao: getDescricaoProduto(item.produto),
        quantidade: item.quantidade,
        valorUnit: getPreco(item.produto),
        subtotal: getPreco(item.produto) * item.quantidade,
      })),
      total: totalCarrinho(),
      perfil,
    };
    
    // Abre em nova aba com os dados para gerar PDF
    const params = encodeURIComponent(JSON.stringify(dados));
    window.open(`/dashboard/estoque/proposta?dados=${params}`, '_blank');
  }

  const categorias = [
    { id: 'TODOS', label: 'Todos', icon: '📦' },
    { id: 'COMPUTADOR', label: 'Computadores', icon: '🖥️' },
    { id: 'NOTEBOOK', label: 'Notebooks', icon: '💻' },
    { id: 'MONITOR', label: 'Monitores', icon: '🖵' },
    { id: 'COMPONENTE', label: 'Componentes', icon: '🔧' },
  ];

  return (
    <div className="estoque-container">
      {/* Header */}
      <div className="estoque-header">
        <div className="estoque-header-left">
          <h1>Catálogo de Estoque</h1>
          <span className="estoque-count">{produtosFiltrados.length} itens</span>
        </div>
        <div className="estoque-header-right">
          {/* Seletor de Perfil */}
          <div className="perfil-selector">
            <button 
              className={`perfil-btn ${perfil === 'prateleira' ? 'active' : ''}`}
              onClick={() => setPerfil('prateleira')}
            >
              Prateleira
            </button>
            <button 
              className={`perfil-btn ${perfil === 'revenda' ? 'active' : ''}`}
              onClick={() => setPerfil('revenda')}
            >
              Revenda
            </button>
            <button 
              className={`perfil-btn ${perfil === 'vendedor' ? 'active' : ''}`}
              onClick={() => setPerfil('vendedor')}
            >
              Vendedor
            </button>
          </div>
          {/* Botão Carrinho */}
          <button 
            className="carrinho-btn"
            onClick={() => setCarrinhoAberto(!carrinhoAberto)}
          >
            🛒 <span className="carrinho-badge">{carrinho.length}</span>
          </button>
        </div>
      </div>

      {/* Filtros de Categoria */}
      <div className="categorias-bar">
        {categorias.map(cat => (
          <button
            key={cat.id}
            className={`categoria-btn ${categoriaAtiva === cat.id ? 'active' : ''}`}
            onClick={() => setCategoriaAtiva(cat.id)}
          >
            <span className="cat-icon">{cat.icon}</span>
            <span className="cat-label">{cat.label}</span>
            {cat.id !== 'TODOS' && (
              <span className="cat-count">
                {produtos.filter(p => p.categoria === cat.id).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Barra de Busca */}
      <div className="busca-container">
        <input
          type="text"
          className="busca-input"
          placeholder="Pesquisar por nome, processador, memória, SSD..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {busca && (
          <button className="busca-clear" onClick={() => setBusca('')}>✕</button>
        )}
      </div>

      {/* Grid de Produtos */}
      {loading ? (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Carregando estoque...</p>
        </div>
      ) : (
        <div className="produtos-grid">
          <AnimatePresence>
            {produtosFiltrados.map((produto, idx) => (
              <motion.div
                key={produto.id}
                className={`produto-card ${produtoExpandido === produto.id ? 'expanded' : ''}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: Math.min(idx * 0.02, 0.5), duration: 0.3 }}
                whileHover={{ scale: 1.02, y: -4 }}
                onClick={() => setProdutoExpandido(produtoExpandido === produto.id ? null : produto.id)}
                layout
              >
                <div className="produto-card-header">
                  <span className={`produto-categoria-tag cat-${produto.categoria.toLowerCase()}`}>
                    {produto.categoria}
                  </span>
                  <span className="produto-qtd">Qtd: {produto.quantidade}</span>
                </div>
                
                <h3 className="produto-nome">{getNomeProduto(produto)}</h3>
                <p className="produto-desc">{getDescricaoProduto(produto)}</p>
                
                <div className="produto-precos">
                  <span className="produto-preco-principal">{formatCurrency(getPreco(produto))}</span>
                  {perfil === 'vendedor' && (
                    <div className="produto-precos-extra">
                      <span className="preco-label">Custo: <strong>{formatCurrency(produto.custo)}</strong></span>
                      <span className="preco-label">Revenda: <strong>{formatCurrency(produto.revenda)}</strong></span>
                      <span className="preco-label margem">Margem: <strong>{produto.valor > 0 ? ((1 - produto.custo / produto.valor) * 100).toFixed(1) : 0}%</strong></span>
                    </div>
                  )}
                  {perfil === 'revenda' && produto.valor > 0 && (
                    <span className="preco-prateleira-ref">Prateleira: {formatCurrency(produto.valor)}</span>
                  )}
                </div>

                {/* Detalhes expandidos */}
                {produtoExpandido === produto.id && (
                  <motion.div
                    className="produto-detalhes"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    {produto.categoria === 'COMPUTADOR' && (
                      <>
                        <div className="detalhe-item"><span>Modalidade:</span><span>{produto.modalidade}</span></div>
                        <div className="detalhe-item"><span>Chassi:</span><span>{produto.chassi}</span></div>
                        <div className="detalhe-item"><span>Processador:</span><span>{produto.processador}</span></div>
                        <div className="detalhe-item"><span>Memória:</span><span>{produto.memoria}</span></div>
                        <div className="detalhe-item"><span>SSD:</span><span>{produto.ssd}</span></div>
                        <div className="detalhe-item"><span>Vídeo:</span><span>{produto.video}</span></div>
                      </>
                    )}
                    {produto.categoria === 'NOTEBOOK' && (
                      <>
                        <div className="detalhe-item"><span>Tela:</span><span>{produto.tamanho}</span></div>
                        <div className="detalhe-item"><span>Processador:</span><span>{produto.processador}</span></div>
                        <div className="detalhe-item"><span>Memória:</span><span>{produto.memoria}</span></div>
                        <div className="detalhe-item"><span>SSD:</span><span>{produto.ssd}</span></div>
                        <div className="detalhe-item"><span>Vídeo:</span><span>{produto.video}</span></div>
                        <div className="detalhe-item"><span>Resolução:</span><span>{produto.resolucao}</span></div>
                      </>
                    )}
                    {produto.categoria === 'MONITOR' && (
                      <>
                        <div className="detalhe-item"><span>Tamanho:</span><span>{produto.tamanho}</span></div>
                        <div className="detalhe-item"><span>Resolução:</span><span>{produto.resolucao}</span></div>
                        <div className="detalhe-item"><span>Tecnologia:</span><span>{produto.tecnologia}</span></div>
                        <div className="detalhe-item"><span>Frequência:</span><span>{produto.frequencia}</span></div>
                        <div className="detalhe-item"><span>Interface:</span><span>{produto.interface_}</span></div>
                        <div className="detalhe-item"><span>Pé:</span><span>{produto.pe}</span></div>
                        <div className="detalhe-item"><span>Estado:</span><span>{produto.estado}</span></div>
                      </>
                    )}
                  </motion.div>
                )}

                <button 
                  className="btn-adicionar"
                  onClick={(e) => { e.stopPropagation(); adicionarAoCarrinho(produto); }}
                >
                  + Adicionar
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Painel do Carrinho */}
      <AnimatePresence>
        {carrinhoAberto && (
          <motion.div
            className="carrinho-painel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          >
            <div className="carrinho-header">
              <h2>🛒 Carrinho ({carrinho.length})</h2>
              <button className="carrinho-fechar" onClick={() => setCarrinhoAberto(false)}>✕</button>
            </div>

            {carrinho.length === 0 ? (
              <p className="carrinho-vazio">Nenhum item no carrinho</p>
            ) : (
              <>
                <div className="carrinho-itens">
                  {carrinho.map(item => (
                    <div key={item.produto.id} className="carrinho-item">
                      <div className="carrinho-item-info">
                        <span className="carrinho-item-nome">{getNomeProduto(item.produto)}</span>
                        <span className="carrinho-item-desc">{getDescricaoProduto(item.produto)}</span>
                        <span className="carrinho-item-preco">{formatCurrency(getPreco(item.produto))}</span>
                      </div>
                      <div className="carrinho-item-acoes">
                        <button onClick={() => alterarQuantidadeCarrinho(item.produto.id, item.quantidade - 1)}>−</button>
                        <span>{item.quantidade}</span>
                        <button onClick={() => alterarQuantidadeCarrinho(item.produto.id, item.quantidade + 1)}>+</button>
                        <button className="btn-remover" onClick={() => removerDoCarrinho(item.produto.id)}>🗑</button>
                      </div>
                      <span className="carrinho-item-subtotal">
                        {formatCurrency(getPreco(item.produto) * item.quantidade)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="carrinho-footer">
                  <div className="carrinho-total">
                    <span>Total:</span>
                    <strong>{formatCurrency(totalCarrinho())}</strong>
                  </div>
                  <div className="carrinho-acoes">
                    <button className="btn-whatsapp" onClick={enviarWhatsApp}>
                      📱 WhatsApp
                    </button>
                    <button className="btn-pdf" onClick={gerarPDF}>
                      📄 Gerar PDF
                    </button>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
