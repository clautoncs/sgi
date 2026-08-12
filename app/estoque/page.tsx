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
  modelo?: string;
  modalidade?: string;
  chassi?: string;
  processador?: string;
  memoria?: string;
  ssd?: string;
  video?: string;
  tamanho?: string;
  resolucao?: string;
  estado?: string;
  tecnologia?: string;
  frequencia?: string;
  interface_?: string;
  pe?: string;
  produto?: string;
}

interface ItemCarrinho {
  produto: Produto;
  quantidade: number;
  valorCustom: number | null; // null = preço original
  desconto: number; // percentual
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
  const [clienteNome, setClienteNome] = useState('');
  const [clienteTelefone, setClienteTelefone] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [gerando, setGerando] = useState(false);
  const [pedidoCriado, setPedidoCriado] = useState<string | null>(null);
  const [editandoPreco, setEditandoPreco] = useState<string | null>(null);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<string>('');

  useEffect(() => {
    fetchEstoque();
    const interval = setInterval(() => {
      fetchEstoque();
    }, 2 * 60 * 1000); // 2 minutos
    return () => clearInterval(interval);
  }, []);

  async function fetchEstoque() {
    try {
      setLoading(true);
      const res = await fetch('/api/estoque');
      const data = await res.json();
      setProdutos(data.produtos || []);
      setUltimaAtualizacao(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
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

  function getPrecoItem(item: ItemCarrinho): number {
    if (item.valorCustom !== null) return item.valorCustom;
    const base = getPreco(item.produto);
    if (item.desconto > 0) return base * (1 - item.desconto / 100);
    return base;
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
      return [...prev, { produto: p, quantidade: 1, valorCustom: null, desconto: 0 }];
    });
  }

  function removerDoCarrinho(id: string) {
    setCarrinho(prev => prev.filter(item => item.produto.id !== id));
  }

  function alterarQuantidadeCarrinho(id: string, qtd: number) {
    if (qtd <= 0) { removerDoCarrinho(id); return; }
    setCarrinho(prev => prev.map(item => 
      item.produto.id === id ? { ...item, quantidade: qtd } : item
    ));
  }

  function aplicarDesconto(id: string, desconto: number) {
    setCarrinho(prev => prev.map(item => 
      item.produto.id === id ? { ...item, desconto: Math.max(0, Math.min(100, desconto)), valorCustom: null } : item
    ));
  }

  function alterarPrecoFinal(id: string, valor: number) {
    setCarrinho(prev => prev.map(item => 
      item.produto.id === id ? { ...item, valorCustom: valor, desconto: 0 } : item
    ));
  }

  function totalCarrinho(): number {
    return carrinho.reduce((acc, item) => acc + (getPrecoItem(item) * item.quantidade), 0);
  }

  function subtotalOriginal(): number {
    return carrinho.reduce((acc, item) => acc + (getPreco(item.produto) * item.quantidade), 0);
  }

  function gerarTextoWhatsApp(): string {
    let texto = `*PROPOSTA COMERCIAL - PCBH Informática*\n`;
    texto += `R. Malaga, 53 - Contagem/MG\n`;
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    if (clienteNome) texto += `*Cliente:* ${clienteNome}\n`;
    if (clienteTelefone) texto += `*Telefone:* ${clienteTelefone}\n`;
    texto += `\n`;
    
    carrinho.forEach((item, idx) => {
      const nome = getNomeProduto(item.produto);
      const desc = getDescricaoProduto(item.produto);
      const preco = getPrecoItem(item);
      texto += `*${idx + 1}. ${nome}*\n`;
      if (desc) texto += `   ${desc}\n`;
      texto += `   Qtd: ${item.quantidade} | Valor: ${formatCurrency(preco)}\n`;
      if (item.desconto > 0) texto += `   _Desconto: ${item.desconto}%_\n`;
      texto += `   *Subtotal: ${formatCurrency(preco * item.quantidade)}*\n\n`;
    });
    
    texto += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    texto += `*TOTAL: ${formatCurrency(totalCarrinho())}*\n\n`;
    if (observacoes) texto += `_Obs: ${observacoes}_\n`;
    texto += `_Proposta válida por 3 dias úteis._\n`;
    texto += `_Sujeito à disponibilidade de estoque._`;
    
    return texto;
  }

  function enviarWhatsApp() {
    const texto = gerarTextoWhatsApp();
    const url = `https://wa.me/${clienteTelefone ? clienteTelefone.replace(/\D/g, '') : ''}?text=${encodeURIComponent(texto)}`;
    window.open(url, '_blank');
  }

  function gerarPDF() {
    const dados = {
      itens: carrinho.map(item => ({
        nome: getNomeProduto(item.produto),
        descricao: getDescricaoProduto(item.produto),
        quantidade: item.quantidade,
        valorUnit: getPrecoItem(item),
        subtotal: getPrecoItem(item) * item.quantidade,
      })),
      total: totalCarrinho(),
      perfil,
    };
    const params = encodeURIComponent(JSON.stringify(dados));
    window.open(`/estoque/proposta?dados=${params}`, '_blank');
  }

  async function gerarPedido(enviarAprovacao: boolean) {
    setGerando(true);
    try {
      const body = {
        criadoPor: 'Vendedor',
        criadoPorEmail: '',
        cliente: clienteNome,
        telefone: clienteTelefone,
        observacoes,
        perfil,
        enviarAprovacao,
        subtotal: subtotalOriginal(),
        descontoGeral: subtotalOriginal() > 0 ? ((1 - totalCarrinho() / subtotalOriginal()) * 100) : 0,
        total: totalCarrinho(),
        itens: carrinho.map(item => ({
          produtoId: item.produto.id,
          nome: getNomeProduto(item.produto),
          descricao: getDescricaoProduto(item.produto),
          categoria: item.produto.categoria,
          quantidade: item.quantidade,
          valorOriginal: getPreco(item.produto),
          valorFinal: getPrecoItem(item),
          desconto: item.desconto || (item.valorCustom !== null ? ((1 - item.valorCustom / getPreco(item.produto)) * 100) : 0),
        })),
      };

      const res = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const pedido = await res.json();
        setPedidoCriado(pedido.id);
      } else {
        alert('Erro ao criar pedido');
      }
    } catch (err) {
      alert('Erro ao criar pedido');
    } finally {
      setGerando(false);
    }
  }

  function copiarLinkPedido() {
    if (pedidoCriado) {
      const link = `${window.location.origin}/estoque/pedido?id=${pedidoCriado}`;
      navigator.clipboard.writeText(link);
      alert('Link copiado!');
    }
  }

  function novoPedido() {
    setCarrinho([]);
    setClienteNome('');
    setClienteTelefone('');
    setObservacoes('');
    setPedidoCriado(null);
  }

  const categorias = [
    { id: 'TODOS', label: 'Todos', icon: '📦' },
    { id: 'COMPUTADOR', label: 'Computadores', icon: '🖥️' },
    { id: 'NOTEBOOK', label: 'Notebooks', icon: '💻' },
    { id: 'MONITOR', label: 'Monitores', icon: '🖵' },
    { id: 'COMPONENTE', label: 'Componentes', icon: '🔧' },
  ];

  const podeEditarPreco = perfil === 'vendedor' || perfil === 'revenda';

  return (
    <div className="estoque-container">
      {/* Header */}
      <div className="estoque-header">
        <div className="estoque-header-left">
          <h1>Catálogo</h1>
          <span className="estoque-count">{produtosFiltrados.length} itens</span>
          {ultimaAtualizacao && (
            <span className="estoque-atualizado">Atualizado: {ultimaAtualizacao} <span className="auto-badge">Auto 2min</span></span>
          )}
        </div>
        <div className="estoque-header-right">
          <div className="perfil-selector">
            <button className={`perfil-btn ${perfil === 'prateleira' ? 'active' : ''}`} onClick={() => setPerfil('prateleira')}>Prateleira</button>
            <button className={`perfil-btn ${perfil === 'revenda' ? 'active' : ''}`} onClick={() => setPerfil('revenda')}>Revenda</button>
            <button className={`perfil-btn ${perfil === 'vendedor' ? 'active' : ''}`} onClick={() => setPerfil('vendedor')}>Vendedor</button>
          </div>
          <a href="/estoque/pedidos" className="btn-pedidos-link">📋 Pedidos</a>
          <button className="carrinho-btn" onClick={() => setCarrinhoAberto(!carrinhoAberto)}>
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
              <span className="cat-count">{produtos.filter(p => p.categoria === cat.id).length}</span>
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
        {busca && <button className="busca-limpar" onClick={() => setBusca('')}>✕</button>}
      </div>

      {/* Grid de Produtos */}
      {loading ? (
        <div className="loading-container"><div className="spinner"></div><p>Carregando catálogo...</p></div>
      ) : (
        <div className="produtos-grid">
          <AnimatePresence>
            {produtosFiltrados.map((produto) => (
              <motion.div
                key={produto.id}
                className="produto-card"
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                whileHover={{ scale: 1.03 }}
                onClick={() => setProdutoExpandido(produtoExpandido === produto.id ? null : produto.id)}
              >
                <div className="produto-card-header">
                  <span className={`produto-cat-badge cat-${produto.categoria.toLowerCase()}`}>{produto.categoria}</span>
                  <span className="produto-qtd">Qtd: {produto.quantidade}</span>
                </div>
                {produto.foto && (
                  <a href={produto.foto} target="_blank" rel="noopener noreferrer" className="produto-foto-link" onClick={(e) => e.stopPropagation()}>
                    📷 Ver Fotos
                  </a>
                )}
                <h3 className="produto-nome">{getNomeProduto(produto)}</h3>
                <p className="produto-desc">{getDescricaoProduto(produto)}</p>
                <div className="produto-preco-area">
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

                {produtoExpandido === produto.id && (
                  <motion.div className="produto-detalhes" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
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
                        <div className="detalhe-item"><span>Estado:</span><span>{produto.estado}</span></div>
                      </>
                    )}
                  </motion.div>
                )}

                <button className="btn-adicionar" onClick={(e) => { e.stopPropagation(); adicionarAoCarrinho(produto); }}>
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

            {pedidoCriado ? (
              <div className="pedido-sucesso">
                <div className="pedido-sucesso-icon">✅</div>
                <h3>Pedido Criado!</h3>
                <p className="pedido-id">{pedidoCriado}</p>
                <div className="pedido-link-area">
                  <input 
                    type="text" 
                    readOnly 
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/estoque/pedido?id=${pedidoCriado}`}
                    className="pedido-link-input"
                  />
                  <button className="btn-copiar-link" onClick={copiarLinkPedido}>📋 Copiar Link</button>
                </div>
                <div className="pedido-sucesso-acoes">
                  <a href={`/estoque/pedido?id=${pedidoCriado}`} className="btn-ver-pedido">Ver Pedido</a>
                  <button className="btn-novo-pedido" onClick={novoPedido}>+ Novo Pedido</button>
                </div>
              </div>
            ) : carrinho.length === 0 ? (
              <p className="carrinho-vazio">Nenhum item no carrinho</p>
            ) : (
              <>
                {/* Dados do Cliente */}
                <div className="carrinho-cliente">
                  <input
                    type="text"
                    placeholder="Nome do cliente"
                    value={clienteNome}
                    onChange={(e) => setClienteNome(e.target.value)}
                    className="input-cliente"
                  />
                  <input
                    type="text"
                    placeholder="Telefone (WhatsApp)"
                    value={clienteTelefone}
                    onChange={(e) => setClienteTelefone(e.target.value)}
                    className="input-cliente"
                  />
                  <textarea
                    placeholder="Observações..."
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    className="input-obs"
                    rows={2}
                  />
                </div>

                <div className="carrinho-itens">
                  {carrinho.map(item => (
                    <div key={item.produto.id} className="carrinho-item">
                      <div className="carrinho-item-info">
                        <span className="carrinho-item-nome">{getNomeProduto(item.produto)}</span>
                        <span className="carrinho-item-desc">{getDescricaoProduto(item.produto)}</span>
                        <div className="carrinho-item-precos">
                          {(item.desconto > 0 || item.valorCustom !== null) && (
                            <span className="preco-original-riscado">{formatCurrency(getPreco(item.produto))}</span>
                          )}
                          <span className="carrinho-item-preco">{formatCurrency(getPrecoItem(item))}</span>
                        </div>
                      </div>

                      {/* Controles de desconto/preço - apenas para vendedor e revenda */}
                      {podeEditarPreco && (
                        <div className="carrinho-item-desconto">
                          {editandoPreco === item.produto.id ? (
                            <div className="editar-preco-area">
                              <div className="desconto-row">
                                <label>Desconto %:</label>
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  value={item.desconto}
                                  onChange={(e) => aplicarDesconto(item.produto.id, parseFloat(e.target.value) || 0)}
                                  className="input-desconto"
                                />
                              </div>
                              <div className="desconto-row">
                                <label>Preço final:</label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={item.valorCustom !== null ? item.valorCustom : getPrecoItem(item)}
                                  onChange={(e) => alterarPrecoFinal(item.produto.id, parseFloat(e.target.value) || 0)}
                                  className="input-preco-final"
                                />
                              </div>
                              <button className="btn-fechar-edicao" onClick={() => setEditandoPreco(null)}>OK</button>
                            </div>
                          ) : (
                            <button className="btn-editar-preco" onClick={() => setEditandoPreco(item.produto.id)}>
                              ✏️ Editar preço
                            </button>
                          )}
                        </div>
                      )}

                      <div className="carrinho-item-acoes">
                        <button onClick={() => alterarQuantidadeCarrinho(item.produto.id, item.quantidade - 1)}>−</button>
                        <span>{item.quantidade}</span>
                        <button onClick={() => alterarQuantidadeCarrinho(item.produto.id, item.quantidade + 1)}>+</button>
                        <button className="btn-remover" onClick={() => removerDoCarrinho(item.produto.id)}>🗑</button>
                      </div>
                      <span className="carrinho-item-subtotal">
                        {formatCurrency(getPrecoItem(item) * item.quantidade)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="carrinho-footer">
                  {subtotalOriginal() !== totalCarrinho() && (
                    <div className="carrinho-subtotal-original">
                      <span>Subtotal original:</span>
                      <span className="valor-riscado">{formatCurrency(subtotalOriginal())}</span>
                    </div>
                  )}
                  <div className="carrinho-total">
                    <span>Total:</span>
                    <strong>{formatCurrency(totalCarrinho())}</strong>
                  </div>
                  {subtotalOriginal() !== totalCarrinho() && (
                    <div className="carrinho-economia">
                      Economia: {formatCurrency(subtotalOriginal() - totalCarrinho())} ({((1 - totalCarrinho() / subtotalOriginal()) * 100).toFixed(1)}%)
                    </div>
                  )}
                  <div className="carrinho-acoes">
                    <button className="btn-whatsapp" onClick={enviarWhatsApp}>📱 WhatsApp</button>
                    <button className="btn-pdf" onClick={gerarPDF}>📄 PDF</button>
                  </div>
                  <div className="carrinho-acoes-pedido">
                    <button 
                      className="btn-salvar-pedido" 
                      onClick={() => gerarPedido(false)}
                      disabled={gerando}
                    >
                      💾 Salvar Rascunho
                    </button>
                    {podeEditarPreco && (
                      <button 
                        className="btn-enviar-aprovacao" 
                        onClick={() => gerarPedido(true)}
                        disabled={gerando}
                      >
                        📤 Enviar p/ Aprovação
                      </button>
                    )}
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
