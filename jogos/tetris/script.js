//=============================
// CONFIGURAÇÕES DO JOGO
//=============================
const canvas = document.getElementById('canvas');
const canvasGuardada = document.getElementById('canvasGuardada');
const canvasProximas = document.getElementById('canvasProximas');

const COLUNAS = 10;               // largura do tabuleiro (em blocos)
const LINHAS = 20;                // altura do tabuleiro (em blocos)
const TAM = 30;                   // tamanho de cada bloco (px)
const LARGURA = COLUNAS * TAM;    // 300px
const ALTURA = LINHAS * TAM;      // 600px

const LINHAS_POR_NIVEL = 10;      // linhas para subir de nível
const VELOCIDADE_MINIMA = 50;     // intervalo mínimo (ms) entre quedas
const TEMPO_TRAVAR = 500;         // tempo (ms) até a peça travar no chão
const MAX_RESETS_TRAVAR = 15;     // quantas vezes mover/girar adia o travamento
const TEMPO_ANIMACAO_LINHAS = 300;

const PONTOS_LINHAS = [0, 100, 300, 500, 800];
const NOMES_LINHAS = ['', 'SIMPLES', 'DUPLA', 'TRIPLA', 'TETRIS!'];

// A dificuldade define o nível em que a partida começa
const DIFICULDADES = {
    facil:   { nome: 'Fácil',   nivelInicial: 1 },
    medio:   { nome: 'Médio',   nivelInicial: 4 },
    dificil: { nome: 'Difícil', nivelInicial: 8 }
};

// Cada peça é uma matriz: 1 = bloco, 0 = vazio
const PECAS = {
    I: { cor: '#22d3ee', forma: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]] },
    J: { cor: '#3b82f6', forma: [[1,0,0],[1,1,1],[0,0,0]] },
    L: { cor: '#f59e0b', forma: [[0,0,1],[1,1,1],[0,0,0]] },
    O: { cor: '#facc15', forma: [[1,1],[1,1]] },
    S: { cor: '#22c55e', forma: [[0,1,1],[1,1,0],[0,0,0]] },
    T: { cor: '#a855f7', forma: [[0,1,0],[1,1,1],[0,0,0]] },
    Z: { cor: '#ef4444', forma: [[1,1,0],[0,1,1],[0,0,0]] }
};
const TIPOS = Object.keys(PECAS);

// Deixa o desenho nítido em telas de alta densidade (retina / celulares)
function prepararCanvas(elemento, largura, altura){
    const dpr = window.devicePixelRatio || 1;
    elemento.width = largura * dpr;
    elemento.height = altura * dpr;
    const contexto = elemento.getContext('2d');
    contexto.scale(dpr, dpr);
    return contexto;
}

const ctx = prepararCanvas(canvas, LARGURA, ALTURA);
const ctxGuardada = prepararCanvas(canvasGuardada, 100, 100);
const ctxProximas = prepararCanvas(canvasProximas, 100, 250);

//============================
// ELEMENTOS DA PÁGINA
//============================
const elPontos = document.getElementById('pontos');
const elRecorde = document.getElementById('recorde');
const elNivel = document.getElementById('nivel');
const elLinhas = document.getElementById('linhas');
const selDificuldade = document.getElementById('dificuldade');
const chkFantasma = document.getElementById('fantasma');
const btnSom = document.getElementById('btnSom');

//============================
// VARIÁVEIS DO JOGO
//============================
let tabuleiro;           // matriz LINHAS x COLUNAS (null = vazio, ou a cor do bloco)
let peca;                // peça que está caindo { tipo, forma, x, y }
let guardada;            // tipo da peça guardada (ou null)
let podeGuardar;         // só pode guardar uma vez por peça
let filaProximas;        // próximas peças (tipos)
let sacola;              // "sacola" de 7 peças: garante distribuição justa

let pontos;
let nivel;
let nivelInicial;
let linhasTotal;
let combo;               // quantas jogadas seguidas eliminaram linhas
let recorde = 0;
let recordeBatido;

let acumulador;          // tempo acumulado para a próxima queda
let travarTempo;         // tempo que a peça está apoiada no chão
let resetsTravar;
let maiorY;
let limpando;            // animação de linhas sendo eliminadas (ou null)

// 'inicial' | 'jogando' | 'pausado' | 'fim'
let estado = 'inicial';

let dificuldadeAtual = DIFICULDADES.medio;
let mostrarFantasma = true;
let ultimoTempo = 0;

// Efeitos visuais
let particulas = [];
let textos = [];
let tremor = 0;

//============================
// RECORDE (um por dificuldade)
//============================
function chaveRecorde(){
    return 'recordeTetris_' + selDificuldade.value;
}

function lerRecorde(){
    try {
        return parseInt(localStorage.getItem(chaveRecorde()), 10) || 0;
    } catch (erro) {
        return 0;   // localStorage pode estar bloqueado (modo privado)
    }
}

function salvarRecorde(){
    try {
        localStorage.setItem(chaveRecorde(), String(recorde));
    } catch (erro) {
        // sem problemas, apenas não salva
    }
}

//============================
// SONS (Web Audio API - sem arquivos externos)
//============================
let audioCtx = null;
let somLigado = true;

function tocarSom(freq, duracao = 0.1, tipo = 'square', volume = 0.05, freqFinal = null){
    if(!somLigado){
        return;
    }
    try {
        if(!audioCtx){
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if(audioCtx.state === 'suspended'){
            audioCtx.resume();
        }
        const agora = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const ganho = audioCtx.createGain();

        osc.type = tipo;
        osc.frequency.setValueAtTime(freq, agora);
        if(freqFinal){
            osc.frequency.exponentialRampToValueAtTime(freqFinal, agora + duracao);
        }
        ganho.gain.setValueAtTime(volume, agora);
        ganho.gain.exponentialRampToValueAtTime(0.0001, agora + duracao);

        osc.connect(ganho);
        ganho.connect(audioCtx.destination);
        osc.start(agora);
        osc.stop(agora + duracao);
    } catch (erro) {
        // navegador sem suporte a áudio: ignora
    }
}

function tocarSequencia(notas, tipo = 'triangle'){
    notas.forEach((freq, i) => {
        setTimeout(() => tocarSom(freq, 0.12, tipo, 0.06), i * 90);
    });
}

//============================
// SACOLA DE PEÇAS (7-bag)
//============================
function embaralhar(lista){
    for(let i = lista.length - 1; i > 0; i--){
        const j = Math.floor(Math.random() * (i + 1));
        [lista[i], lista[j]] = [lista[j], lista[i]];
    }
    return lista;
}

function sortearTipo(){
    if(sacola.length === 0){
        sacola = embaralhar([...TIPOS]);
    }
    return sacola.pop();
}

function novaPeca(tipo){
    const forma = PECAS[tipo].forma.map(linha => linha.slice());
    return {
        tipo: tipo,
        forma: forma,
        x: Math.floor((COLUNAS - forma.length) / 2),
        y: tipo === 'I' ? -1 : 0
    };
}

//============================
// PREPARAR / INICIAR O JOGO
//============================
function criarTabuleiro(){
    return Array.from({ length: LINHAS }, () => Array(COLUNAS).fill(null));
}

function prepararJogo(){
    dificuldadeAtual = DIFICULDADES[selDificuldade.value];
    mostrarFantasma = chkFantasma.checked;

    tabuleiro = criarTabuleiro();
    sacola = [];
    filaProximas = [sortearTipo(), sortearTipo(), sortearTipo()];
    peca = null;
    guardada = null;
    podeGuardar = true;

    nivelInicial = dificuldadeAtual.nivelInicial;
    nivel = nivelInicial;
    pontos = 0;
    linhasTotal = 0;
    combo = 0;
    recordeBatido = false;

    acumulador = 0;
    travarTempo = 0;
    resetsTravar = 0;
    maiorY = -2;
    limpando = null;

    particulas = [];
    textos = [];
    tremor = 0;

    recorde = lerRecorde();
    atualizarPainel();
}

function iniciarJogo(){
    pararTodasRepeticoes();
    prepararJogo();
    estado = 'jogando';
    proximaPeca();
    tocarSom(440, 0.1, 'square', 0.05, 660);
}

function voltarParaTelaInicial(){
    pararTodasRepeticoes();
    prepararJogo();
    estado = 'inicial';
}

//===================================
// VELOCIDADE (a partir do nível)
//===================================
function intervaloQueda(){
    return Math.max(VELOCIDADE_MINIMA, 800 * Math.pow(0.8, nivel - 1));
}

//===================================
// COLISÃO E MOVIMENTO
//===================================
// Retorna true se a forma, na posição (px, py), bate em parede, chão ou bloco.
// Células acima do topo (py < 0) são permitidas: é onde a peça nasce.
function colide(forma, px, py){
    for(let y = 0; y < forma.length; y++){
        for(let x = 0; x < forma[y].length; x++){
            if(!forma[y][x]){
                continue;
            }
            const nx = px + x;
            const ny = py + y;
            if(nx < 0 || nx >= COLUNAS || ny >= LINHAS){
                return true;
            }
            if(ny >= 0 && tabuleiro[ny][nx] !== null){
                return true;
            }
        }
    }
    return false;
}

function noChao(){
    return colide(peca.forma, peca.x, peca.y + 1);
}

function yFantasma(){
    let gy = peca.y;
    while(!colide(peca.forma, peca.x, gy + 1)){
        gy++;
    }
    return gy;
}

function podeAgir(){
    return estado === 'jogando' && !limpando && peca !== null;
}

// Depois de mover/girar: se continua no chão, adia o travamento (até um limite)
function aposMovimento(){
    if(noChao()){
        if(resetsTravar < MAX_RESETS_TRAVAR){
            travarTempo = 0;
            resetsTravar++;
        }
    }else{
        travarTempo = 0;
    }
}

function moverHorizontal(dx){
    if(!podeAgir()){
        return;
    }
    if(!colide(peca.forma, peca.x + dx, peca.y)){
        peca.x += dx;
        tocarSom(200, 0.03, 'square', 0.02);
        aposMovimento();
    }
}

// manual = true quando o jogador está descendo (ganha +1 ponto por casa)
function moverBaixo(manual){
    if(!podeAgir()){
        return false;
    }
    if(colide(peca.forma, peca.x, peca.y + 1)){
        return false;
    }
    peca.y++;
    if(peca.y > maiorY){
        maiorY = peca.y;
        resetsTravar = 0;
    }
    if(manual){
        adicionarPontos(1);
    }
    return true;
}

function quedaRapida(){
    if(!podeAgir()){
        return;
    }
    let casas = 0;
    while(!colide(peca.forma, peca.x, peca.y + 1)){
        peca.y++;
        casas++;
    }
    adicionarPontos(casas * 2);
    tremor = 4;
    travarPeca();
}

//============================
// ROTAÇÃO
//============================
function rotacionar(forma, horario){
    const n = forma.length;
    const nova = Array.from({ length: n }, () => Array(n).fill(0));
    for(let y = 0; y < n; y++){
        for(let x = 0; x < n; x++){
            if(horario){
                nova[x][n - 1 - y] = forma[y][x];
            }else{
                nova[n - 1 - x][y] = forma[y][x];
            }
        }
    }
    return nova;
}

// Se a peça girada bater em algo, tenta empurrá-la um pouco ("wall kick")
const CHUTES = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1], [-1, -1], [1, -1]];

function girar(horario){
    if(!podeAgir()){
        return;
    }
    const nova = rotacionar(peca.forma, horario);
    for(const [dx, dy] of CHUTES){
        if(!colide(nova, peca.x + dx, peca.y + dy)){
            peca.forma = nova;
            peca.x += dx;
            peca.y += dy;
            tocarSom(330, 0.05, 'square', 0.03, 440);
            aposMovimento();
            return;
        }
    }
}

//============================
// GUARDAR PEÇA (HOLD)
//============================
function guardarPeca(){
    if(!podeAgir() || !podeGuardar){
        return;
    }
    const tipoAtual = peca.tipo;
    if(guardada){
        peca = novaPeca(guardada);
    }else{
        peca = novaPeca(filaProximas.shift());
        filaProximas.push(sortearTipo());
    }
    guardada = tipoAtual;
    podeGuardar = false;

    acumulador = 0;
    travarTempo = 0;
    resetsTravar = 0;
    maiorY = peca.y;
    tocarSom(400, 0.08, 'triangle', 0.05, 300);

    if(colide(peca.forma, peca.x, peca.y)){
        fimDeJogo();
    }
}

//===================================
// TRAVAR PEÇA, LINHAS E NOVA PEÇA
//===================================
function proximaPeca(){
    peca = novaPeca(filaProximas.shift());
    filaProximas.push(sortearTipo());
    podeGuardar = true;

    acumulador = 0;
    travarTempo = 0;
    resetsTravar = 0;
    maiorY = peca.y;

    // se a peça nasce já batendo em algo, acabou
    if(colide(peca.forma, peca.x, peca.y)){
        fimDeJogo();
    }
}

function travarPeca(){
    let acimaDoTopo = false;
    const cor = PECAS[peca.tipo].cor;

    peca.forma.forEach((linha, y) => {
        linha.forEach((valor, x) => {
            if(!valor){
                return;
            }
            const px = peca.x + x;
            const py = peca.y + y;
            if(py < 0){
                acimaDoTopo = true;
                return;
            }
            tabuleiro[py][px] = cor;
        });
    });
    peca = null;

    if(acimaDoTopo){
        fimDeJogo();
        return;
    }

    tocarSom(120, 0.08, 'square', 0.05, 80);

    const completas = [];
    for(let y = 0; y < LINHAS; y++){
        if(tabuleiro[y].every(celula => celula !== null)){
            completas.push(y);
        }
    }

    if(completas.length > 0){
        registrarLinhas(completas);
    }else{
        combo = 0;
        proximaPeca();
    }
}

function registrarLinhas(completas){
    const n = completas.length;
    const base = PONTOS_LINHAS[n] * nivel;
    const bonusCombo = combo > 0 ? 50 * combo * nivel : 0;
    combo++;

    adicionarPontos(base + bonusCombo);
    linhasTotal += n;

    // partículas com a cor de cada bloco eliminado
    completas.forEach(y => {
        for(let x = 0; x < COLUNAS; x++){
            criarParticulas(x * TAM + TAM / 2, y * TAM + TAM / 2, tabuleiro[y][x], 2);
        }
    });

    limpando = { linhas: completas, tempo: 0 };

    const yTexto = Math.max(50, ((completas[0] + completas[n - 1] + 1) / 2) * TAM - 20);
    adicionarTexto(NOMES_LINHAS[n], LARGURA / 2, yTexto, n === 4 ? '#ffd166' : '#ffffff', n === 4 ? 30 : 22, 1200);
    adicionarTexto('+' + (base + bonusCombo), LARGURA / 2, yTexto + 26, '#ffffff', 16, 1200);
    if(combo >= 2){
        adicionarTexto('COMBO x' + combo, LARGURA / 2, yTexto + 48, '#f39c12', 16, 1200);
    }

    if(n === 4){
        tremor = 8;
        tocarSequencia([523, 659, 784, 1047]);
    }else{
        tocarSom(500 + n * 120, 0.15, 'square', 0.05, 900 + n * 120);
    }

    // sobe de nível?
    const novoNivel = nivelInicial + Math.floor(linhasTotal / LINHAS_POR_NIVEL);
    if(novoNivel > nivel){
        nivel = novoNivel;
        adicionarTexto('NÍVEL ' + nivel + '!', LARGURA / 2, ALTURA / 2, '#ffd166', 32, 1600);
        setTimeout(() => tocarSequencia([523, 659, 784]), 250);
    }
    atualizarPainel();
}

function finalizarLimpeza(){
    // remove de cima para baixo (ordem crescente) e abre linhas vazias no topo
    limpando.linhas.slice().sort((a, b) => a - b).forEach(y => {
        tabuleiro.splice(y, 1);
        tabuleiro.unshift(Array(COLUNAS).fill(null));
    });
    limpando = null;
    proximaPeca();
}

//============================
// PONTOS E PAINEL
//============================
function adicionarPontos(quantidade){
    if(quantidade <= 0){
        return;
    }
    pontos += quantidade;
    if(pontos > recorde){
        recorde = pontos;
        recordeBatido = true;
        salvarRecorde();
    }
    atualizarPainel();
}

function atualizarPainel(){
    elPontos.textContent = pontos;
    elRecorde.textContent = recorde;
    elNivel.textContent = nivel;
    elLinhas.textContent = linhasTotal;
}

//============================
// FIM DE JOGO / PAUSA
//============================
function fimDeJogo(){
    estado = 'fim';
    tremor = 14;
    pararTodasRepeticoes();
    tocarSom(300, 0.5, 'sawtooth', 0.08, 60);
}

function pausarJogo(){
    if(estado === 'jogando'){
        estado = 'pausado';
        pararTodasRepeticoes();
    }else if(estado === 'pausado'){
        estado = 'jogando';
    }
}

//===================================
// EFEITOS: PARTÍCULAS E TEXTOS
//===================================
function criarParticulas(cx, cy, cor, quantidade){
    for(let i = 0; i < quantidade; i++){
        const angulo = Math.random() * Math.PI * 2;
        const vel = 0.05 + Math.random() * 0.15;   // pixels por ms
        particulas.push({
            x: cx, y: cy,
            vx: Math.cos(angulo) * vel,
            vy: Math.sin(angulo) * vel,
            vida: 500, vidaMax: 500,
            cor: cor
        });
    }
}

function adicionarTexto(texto, x, y, cor, tamanho, vida){
    textos.push({ texto, x, y, cor, tamanho, vida, vidaMax: vida });
}

function atualizarEfeitos(dt){
    particulas.forEach(p => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vida -= dt;
    });
    particulas = particulas.filter(p => p.vida > 0);

    textos.forEach(t => {
        t.y -= 0.02 * dt;
        t.vida -= dt;
    });
    textos = textos.filter(t => t.vida > 0);

    tremor *= 0.9;
}

//===================================
// LOOP PRINCIPAL (requestAnimationFrame)
//===================================
function loop(tempo){
    requestAnimationFrame(loop);

    // limita o dt para não "pular" tempo quando a aba fica em segundo plano
    const dt = Math.min(tempo - ultimoTempo, 100);
    ultimoTempo = tempo;

    if(estado === 'jogando'){
        if(limpando){
            limpando.tempo += dt;
            if(limpando.tempo >= TEMPO_ANIMACAO_LINHAS){
                finalizarLimpeza();
            }
        }else if(peca){
            if(noChao()){
                // apoiada: espera um pouco antes de travar
                acumulador = 0;
                travarTempo += dt;
                if(travarTempo >= TEMPO_TRAVAR){
                    travarPeca();
                }
            }else{
                travarTempo = 0;
                acumulador += dt;
                const intervalo = intervaloQueda();
                while(acumulador >= intervalo && estado === 'jogando' && peca){
                    acumulador -= intervalo;
                    if(!moverBaixo(false)){
                        break;
                    }
                }
            }
        }
    }

    if(estado !== 'pausado'){
        atualizarEfeitos(dt);
    }

    desenhar();
}

//=============================
// DESENHO
//=============================
function escreverTexto(c, texto, x, y, tamanho, cor = 'white', negrito = true){
    c.font = (negrito ? 'bold ' : '') + tamanho + 'px Arial';
    c.fillStyle = cor;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(texto, x, y);
}

// Desenha um bloco com efeito de luz e sombra
function desenharBloco(c, px, py, tam, cor){
    const borda = Math.max(2, Math.round(tam / 10));
    c.fillStyle = cor;
    c.fillRect(px + 1, py + 1, tam - 2, tam - 2);

    c.fillStyle = 'rgba(255, 255, 255, 0.35)';
    c.fillRect(px + 1, py + 1, tam - 2, borda);
    c.fillRect(px + 1, py + 1, borda, tam - 2);

    c.fillStyle = 'rgba(0, 0, 0, 0.25)';
    c.fillRect(px + 1, py + tam - 1 - borda, tam - 2, borda);
    c.fillRect(px + tam - 1 - borda, py + 1, borda, tam - 2);
}

function desenhar(){
    ctx.save();
    if(tremor > 0.5){
        ctx.translate((Math.random() - 0.5) * tremor, (Math.random() - 0.5) * tremor);
    }

    desenharTabuleiro();
    desenharPilha();
    desenharFantasma();
    desenharPecaAtual();
    desenharParticulas();
    desenharTextos();

    ctx.restore();

    desenharTelas();
    desenharGuardada();
    desenharProximas();
}

function desenharTabuleiro(){
    ctx.fillStyle = '#1f2d3d';
    ctx.fillRect(0, 0, LARGURA, ALTURA);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for(let x = 1; x < COLUNAS; x++){
        ctx.moveTo(x * TAM + 0.5, 0);
        ctx.lineTo(x * TAM + 0.5, ALTURA);
    }
    for(let y = 1; y < LINHAS; y++){
        ctx.moveTo(0, y * TAM + 0.5);
        ctx.lineTo(LARGURA, y * TAM + 0.5);
    }
    ctx.stroke();
}

function desenharPilha(){
    for(let y = 0; y < LINHAS; y++){
        for(let x = 0; x < COLUNAS; x++){
            const cor = tabuleiro[y][x];
            if(!cor){
                continue;
            }
            let corFinal = cor;
            // linhas completas piscam em branco antes de sumir
            if(limpando && limpando.linhas.includes(y) && Math.floor(limpando.tempo / 60) % 2 === 0){
                corFinal = '#ffffff';
            }
            desenharBloco(ctx, x * TAM, y * TAM, TAM, corFinal);
        }
    }
}

function desenharFantasma(){
    if(!mostrarFantasma || !peca || !podeAgir()){
        return;
    }
    const gy = yFantasma();
    if(gy === peca.y){
        return;
    }
    const cor = PECAS[peca.tipo].cor;
    peca.forma.forEach((linha, y) => {
        linha.forEach((valor, x) => {
            if(!valor || gy + y < 0){
                return;
            }
            const px = (peca.x + x) * TAM;
            const py = (gy + y) * TAM;
            ctx.globalAlpha = 0.25;
            ctx.fillStyle = cor;
            ctx.fillRect(px + 1, py + 1, TAM - 2, TAM - 2);
            ctx.globalAlpha = 0.8;
            ctx.strokeStyle = cor;
            ctx.lineWidth = 2;
            ctx.strokeRect(px + 3, py + 3, TAM - 6, TAM - 6);
            ctx.globalAlpha = 1;
        });
    });
}

function desenharPecaAtual(){
    if(!peca){
        return;
    }
    const cor = PECAS[peca.tipo].cor;
    peca.forma.forEach((linha, y) => {
        linha.forEach((valor, x) => {
            if(!valor || peca.y + y < 0){
                return;
            }
            desenharBloco(ctx, (peca.x + x) * TAM, (peca.y + y) * TAM, TAM, cor);
        });
    });
}

function desenharParticulas(){
    particulas.forEach(p => {
        ctx.globalAlpha = Math.max(0, p.vida / p.vidaMax);
        ctx.fillStyle = p.cor;
        ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    });
    ctx.globalAlpha = 1;
}

function desenharTextos(){
    textos.forEach(t => {
        ctx.globalAlpha = Math.max(0, Math.min(1, t.vida / (t.vidaMax * 0.4)));
        escreverTexto(ctx, t.texto, t.x, t.y, t.tamanho, t.cor);
    });
    ctx.globalAlpha = 1;
}

// Desenha uma peça pequena centralizada em (cx, cy) nos painéis laterais
function desenharMini(c, tipo, cx, cy, tam, opacidade){
    const forma = PECAS[tipo].forma;
    let minX = 99, maxX = -1, minY = 99, maxY = -1;
    forma.forEach((linha, y) => {
        linha.forEach((valor, x) => {
            if(valor){
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
            }
        });
    });
    const largura = (maxX - minX + 1) * tam;
    const altura = (maxY - minY + 1) * tam;
    const inicioX = cx - largura / 2 - minX * tam;
    const inicioY = cy - altura / 2 - minY * tam;

    c.globalAlpha = opacidade;
    forma.forEach((linha, y) => {
        linha.forEach((valor, x) => {
            if(valor){
                desenharBloco(c, inicioX + x * tam, inicioY + y * tam, tam, PECAS[tipo].cor);
            }
        });
    });
    c.globalAlpha = 1;
}

function desenharGuardada(){
    ctxGuardada.fillStyle = '#1f2d3d';
    ctxGuardada.fillRect(0, 0, 100, 100);
    if(guardada){
        desenharMini(ctxGuardada, guardada, 50, 50, 20, podeGuardar ? 1 : 0.35);
    }
}

function desenharProximas(){
    ctxProximas.fillStyle = '#1f2d3d';
    ctxProximas.fillRect(0, 0, 100, 250);
    filaProximas.forEach((tipo, i) => {
        desenharMini(ctxProximas, tipo, 50, 45 + i * 80, 20, 1);
    });
}

// Telas sobrepostas (início, pausa, fim)
function desenharTelas(){
    if(estado === 'jogando'){
        return;
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
    ctx.fillRect(0, 0, LARGURA, ALTURA);

    const cx = LARGURA / 2;

    if(estado === 'inicial'){
        escreverTexto(ctx, 'TETRIS', cx, 220, 44);
        escreverTexto(ctx, 'Dificuldade: ' + dificuldadeAtual.nome, cx, 285, 18, '#ffd166');
        escreverTexto(ctx, 'Começa no nível ' + dificuldadeAtual.nivelInicial, cx, 312, 15, '#cccccc', false);
        escreverTexto(ctx, 'Pressione ENTER ou toque aqui', cx, 380, 16);
    }else if(estado === 'pausado'){
        escreverTexto(ctx, 'PAUSADO', cx, 280, 40);
        escreverTexto(ctx, 'P para continuar', cx, 325, 16, '#cccccc', false);
    }else if(estado === 'fim'){
        escreverTexto(ctx, 'FIM DE JOGO', cx, 210, 38, '#ff6b6b');
        escreverTexto(ctx, 'Pontuação: ' + pontos, cx, 270, 22);
        escreverTexto(ctx, 'Nível: ' + nivel + '  |  Linhas: ' + linhasTotal, cx, 304, 16, '#cccccc', false);
        if(recordeBatido){
            escreverTexto(ctx, 'NOVO RECORDE!', cx, 345, 24, '#ffd166');
        }
        escreverTexto(ctx, 'ENTER para jogar de novo', cx, 400, 16);
    }
}

//===========================
// AÇÕES (teclado e botões usam as mesmas)
//===========================
function executarAcao(acao){
    switch(acao){
        case 'esquerda':  moverHorizontal(-1); break;
        case 'direita':   moverHorizontal(1);  break;
        case 'baixo':     moverBaixo(true);    break;
        case 'girar':     girar(true);         break;
        case 'girarAnti': girar(false);        break;
        case 'guardar':   guardarPeca();       break;
        case 'pausar':    pausarJogo();        break;
        case 'iniciar':   iniciarJogo();       break;
        case 'queda':
            if(estado === 'inicial' || estado === 'fim'){
                iniciarJogo();
            }else{
                quedaRapida();
            }
            break;
    }
}

// Repetição automática ao segurar uma tecla/botão (mover e descer)
const repetidores = {};

function iniciarRepeticao(chave, acao){
    pararRepeticao(chave);
    acao();
    const r = {};
    r.atraso = setTimeout(() => {
        r.intervalo = setInterval(acao, 55);
    }, 160);
    repetidores[chave] = r;
}

function pararRepeticao(chave){
    const r = repetidores[chave];
    if(!r){
        return;
    }
    clearTimeout(r.atraso);
    clearInterval(r.intervalo);
    delete repetidores[chave];
}

function pararTodasRepeticoes(){
    Object.keys(repetidores).forEach(pararRepeticao);
}

const ACOES_COM_REPETICAO = ['esquerda', 'direita', 'baixo'];

//===========================
// CONTROLE DE TECLADO
//===========================
const acoesTeclado = {
    ArrowLeft: 'esquerda',  a: 'esquerda',
    ArrowRight: 'direita',  d: 'direita',
    ArrowDown: 'baixo',     s: 'baixo',
    ArrowUp: 'girar',       w: 'girar',  x: 'girar',
    z: 'girarAnti',
    ' ': 'queda',
    c: 'guardar',           Shift: 'guardar',
    p: 'pausar',            Escape: 'pausar',
    Enter: 'iniciar'
};

function nomeDaTecla(event){
    return event.key.length === 1 ? event.key.toLowerCase() : event.key;
}

document.addEventListener('keydown', function(event){
    if(event.ctrlKey || event.metaKey || event.altKey){
        return;   // não atrapalha atalhos do navegador (Ctrl+R, etc.)
    }
    if(event.target && event.target.tagName === 'SELECT'){
        return;   // deixa o select funcionar com o teclado
    }

    const tecla = nomeDaTecla(event);
    const acao = acoesTeclado[tecla];
    if(!acao){
        return;
    }

    event.preventDefault();

    // tira o foco de botões: evita que Espaço/Enter "cliquem" no botão focado
    if(document.activeElement && document.activeElement !== document.body){
        document.activeElement.blur();
    }

    if(event.repeat){
        return;   // a repetição é feita por nós, com tempo controlado
    }

    if(ACOES_COM_REPETICAO.includes(acao)){
        iniciarRepeticao(tecla, () => executarAcao(acao));
    }else{
        executarAcao(acao);
    }
});

document.addEventListener('keyup', function(event){
    pararRepeticao(nomeDaTecla(event));
});

window.addEventListener('blur', pararTodasRepeticoes);

//===========================
// BOTÕES, SELECTS E BOTÕES NA TELA
//===========================
document.getElementById('btnIniciar').addEventListener('click', function(){
    this.blur();
    iniciarJogo();
});

document.getElementById('btnPausar').addEventListener('click', function(){
    this.blur();
    pausarJogo();
});

btnSom.addEventListener('click', function(){
    somLigado = !somLigado;
    this.textContent = somLigado ? '\u{1F50A} Som: ligado' : '\u{1F507} Som: desligado';
    this.blur();
});

// trocar a dificuldade volta para a tela inicial
selDificuldade.addEventListener('change', function(){
    this.blur();
    voltarParaTelaInicial();
});

chkFantasma.addEventListener('change', function(){
    mostrarFantasma = this.checked;
    this.blur();
});

document.querySelectorAll('.tecla[data-acao]').forEach(botao => {
    const acao = botao.dataset.acao;
    const chave = 'toque-' + acao;

    botao.addEventListener('pointerdown', function(event){
        event.preventDefault();
        if(ACOES_COM_REPETICAO.includes(acao)){
            iniciarRepeticao(chave, () => executarAcao(acao));
        }else{
            executarAcao(acao);
        }
    });

    ['pointerup', 'pointercancel', 'pointerleave'].forEach(nome => {
        botao.addEventListener(nome, () => pararRepeticao(chave));
    });
});

// toque no tabuleiro: inicia, retoma ou gira a peça
canvas.addEventListener('pointerup', function(){
    if(estado === 'pausado'){
        pausarJogo();
    }else if(estado === 'jogando'){
        girar(true);
    }else{
        iniciarJogo();
    }
});

// pausa sozinho se o jogador trocar de aba
document.addEventListener('visibilitychange', function(){
    if(document.hidden && estado === 'jogando'){
        pausarJogo();
    }
});

//===========================
// INÍCIO
//===========================
prepararJogo();
requestAnimationFrame(loop);