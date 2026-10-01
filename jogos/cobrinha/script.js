//=============================
// CONFIGURAÇÕES DO JOGO
//=============================
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const tamanhoQuadrado = 20;                       // tamanho de cada quadrado
const tamanhoCanvas = 400;                        // tamanho "lógico" do desenho
const quantidadeQuadrados = tamanhoCanvas / tamanhoQuadrado;

// Deixa o desenho nítido em telas de alta densidade (retina / celulares)
const dpr = window.devicePixelRatio || 1;
canvas.width = tamanhoCanvas * dpr;
canvas.height = tamanhoCanvas * dpr;
ctx.scale(dpr, dpr);

// Regras de jogabilidade
const MACAS_POR_NIVEL   = 5;      // maçãs necessárias para subir de nível
const VELOCIDADE_MINIMA = 60;     // intervalo mínimo (ms) entre movimentos
const JANELA_COMBO      = 5000;   // tempo (ms) para manter o combo
const COMBO_MAXIMO      = 5;
const DURACAO_ESPECIAL  = 7000;   // tempo (ms) que a maçã dourada / gelo ficam na tela
const DURACAO_LENTO     = 6000;   // duração (ms) do efeito de gelo
const MAX_OBSTACULOS    = 25;

// Níveis de dificuldade
// velocidadeInicial = ms entre movimentos (menor = mais rápido)
const DIFICULDADES = {
    facil:   { nome: 'Fácil',   velocidadeInicial: 220, passoVelocidade: 12, multiplicador: 1,   obstaculosPorNivel: 0 },
    medio:   { nome: 'Médio',   velocidadeInicial: 160, passoVelocidade: 12, multiplicador: 1.5, obstaculosPorNivel: 1 },
    dificil: { nome: 'Difícil', velocidadeInicial: 110, passoVelocidade: 10, multiplicador: 2,   obstaculosPorNivel: 2 }
};

const opostas = { cima: 'baixo', baixo: 'cima', esquerda: 'direita', direita: 'esquerda' };

const mapaTeclas = {
    ArrowUp: 'cima', ArrowDown: 'baixo', ArrowLeft: 'esquerda', ArrowRight: 'direita',
    w: 'cima', s: 'baixo', a: 'esquerda', d: 'direita'
};

//============================
// ELEMENTOS DA PÁGINA
//============================
const elPontos = document.getElementById('pontos');
const elRecorde = document.getElementById('recorde');
const elNivel = document.getElementById('nivel');
const elCombo = document.getElementById('combo');
const selDificuldade = document.getElementById('dificuldade');
const chkAtravessar = document.getElementById('atravessar');
const btnSom = document.getElementById('btnSom');

//============================
// VARIÁVEIS DO JOGO
//============================
let cobra;               // Array com as posições da cobra
let direcao;             // Direção atual
let filaDirecoes;        // Fila de comandos (até 2) - não perde cliques rápidos
let comida;              // Maçã vermelha
let especial;            // Maçã dourada ou gelo (ou null)
let obstaculos;          // Array de blocos
let pontos;
let nivel;
let macasComidas;
let combo;
let tempoDesdeComida;    // ms desde a última maçã (para o combo)
let efeitoLento;         // ms restantes do efeito de gelo
let recorde = 0;
let recordeBatido;       // true se bateu o recorde nesta partida

// 'inicial' | 'jogando' | 'pausado' | 'fim' | 'vitoria'
let estado = 'inicial';

let dificuldadeAtual = DIFICULDADES.medio;
let atravessarParedes = false;

// Controle do loop
let acumulador = 0;
let ultimoTempo = 0;

// Efeitos visuais
let particulas = [];
let textosFlutuantes = [];
let avisoNivel = 0;
let tremor = 0;

//============================
// RECORDE (um por dificuldade/modo)
//============================
function chaveRecorde(){
    return 'recordeCobrinha_' + selDificuldade.value + (chkAtravessar.checked ? '_livre' : '');
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
// PREPARAR / INICIAR O JOGO
//============================
function prepararJogo(){
    dificuldadeAtual = DIFICULDADES[selDificuldade.value];
    atravessarParedes = chkAtravessar.checked;

    cobra = [
        { x: 10, y: 10 },
        { x: 9,  y: 10 },
        { x: 8,  y: 10 }
    ];
    direcao = 'direita';
    filaDirecoes = [];
    obstaculos = [];
    comida = null;
    especial = null;

    pontos = 0;
    nivel = 1;
    macasComidas = 0;
    combo = 0;
    tempoDesdeComida = Infinity;
    efeitoLento = 0;
    recordeBatido = false;

    particulas = [];
    textosFlutuantes = [];
    avisoNivel = 0;
    tremor = 0;
    acumulador = 0;

    recorde = lerRecorde();
    gerarComida();
    atualizarPainel();
}

function iniciarJogo(){
    prepararJogo();
    estado = 'jogando';
    tocarSom(440, 0.1, 'square', 0.05, 660);
}

function voltarParaTelaInicial(){
    prepararJogo();
    estado = 'inicial';
}

//===================================
// VELOCIDADE (calculada a partir do nível)
//===================================
function velocidadeBase(){
    const v = dificuldadeAtual.velocidadeInicial - (nivel - 1) * dificuldadeAtual.passoVelocidade;
    return Math.max(VELOCIDADE_MINIMA, v);   // nunca fica rápido demais (bug do original)
}

function intervaloAtual(){
    return velocidadeBase() * (efeitoLento > 0 ? 1.7 : 1);
}

//===================================
// LOOP PRINCIPAL (requestAnimationFrame + acumulador de tempo)
//===================================
function loop(tempo){
    requestAnimationFrame(loop);

    // limita o dt para não "pular" tempo quando a aba fica em segundo plano
    const dt = Math.min(tempo - ultimoTempo, 100);
    ultimoTempo = tempo;

    if(estado === 'jogando'){
        atualizarTempos(dt);

        acumulador += dt;
        let intervalo = intervaloAtual();
        while(acumulador >= intervalo && estado === 'jogando'){
            acumulador -= intervalo;
            atualizarJogo();
            intervalo = intervaloAtual();
        }
    }

    if(estado !== 'pausado'){
        atualizarEfeitosVisuais(dt);
    }

    desenhar();
}

// Cronômetros que só correm enquanto o jogo está rodando (pausa congela tudo)
function atualizarTempos(dt){
    tempoDesdeComida += dt;

    if(combo > 0 && tempoDesdeComida > JANELA_COMBO){
        combo = 0;
        atualizarPainel();
    }

    if(especial){
        especial.tempoRestante -= dt;
        if(especial.tempoRestante <= 0){
            especial = null;
        }
    }

    if(efeitoLento > 0){
        efeitoLento = Math.max(0, efeitoLento - dt);
    }
}

function atualizarEfeitosVisuais(dt){
    particulas.forEach(p => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vida -= dt;
    });
    particulas = particulas.filter(p => p.vida > 0);

    textosFlutuantes.forEach(t => {
        t.y -= 0.03 * dt;
        t.vida -= dt;
    });
    textosFlutuantes = textosFlutuantes.filter(t => t.vida > 0);

    if(avisoNivel > 0){
        avisoNivel -= dt;
    }
    tremor *= 0.9;
}

//===================================
// ATUALIZAR O JOGO (um "passo" da cobra)
//===================================
function atualizarJogo(){
    // pega o próximo comando da fila (se houver)
    if(filaDirecoes.length > 0){
        direcao = filaDirecoes.shift();
    }

    const cabeca = { ...cobra[0] };

    switch(direcao){
        case 'cima':     cabeca.y--; break;
        case 'baixo':    cabeca.y++; break;
        case 'esquerda': cabeca.x--; break;
        case 'direita':  cabeca.x++; break;
    }

    // paredes: atravessa (modo livre) ou perde
    if(atravessarParedes){
        cabeca.x = (cabeca.x + quantidadeQuadrados) % quantidadeQuadrados;
        cabeca.y = (cabeca.y + quantidadeQuadrados) % quantidadeQuadrados;
    }else if(cabeca.x < 0 || cabeca.x >= quantidadeQuadrados ||
             cabeca.y < 0 || cabeca.y >= quantidadeQuadrados){
        fimDeJogo();
        return;
    }

    // colisão com obstáculos
    if(obstaculos.some(o => o.x === cabeca.x && o.y === cabeca.y)){
        fimDeJogo();
        return;
    }

    // o que a cabeça encontrou?
    const comeuComum = comida && cabeca.x === comida.x && cabeca.y === comida.y;
    const comeuEspecial = especial && cabeca.x === especial.x && cabeca.y === especial.y;
    const cresce = comeuComum || (comeuEspecial && especial.tipo === 'dourada');

    // colisão com o próprio corpo.
    // Se a cobra não vai crescer, a ponta do rabo sai do lugar, então pode ser pisada.
    const corpo = cresce ? cobra : cobra.slice(0, -1);
    if(corpo.some(p => p.x === cabeca.x && p.y === cabeca.y)){
        fimDeJogo();
        return;
    }

    cobra.unshift(cabeca);
    if(!cresce){
        cobra.pop();
    }

    if(comeuComum){
        processarComidaComum(cabeca);
    }
    if(comeuEspecial){
        processarEspecial(cabeca);
    }
}

//===================================
// COMIDA, PONTOS, COMBO E NÍVEIS
//===================================
function processarComidaComum(cabeca){
    // combo: comer rápido multiplica os pontos
    if(tempoDesdeComida <= JANELA_COMBO){
        combo = Math.min(combo + 1, COMBO_MAXIMO);
    }else{
        combo = 1;
    }
    tempoDesdeComida = 0;

    const ganho = Math.round(10 * dificuldadeAtual.multiplicador) * combo;
    adicionarPontos(ganho, cabeca.x, cabeca.y);
    criarParticulas(cabeca.x, cabeca.y, '#ff6b6b', 12);
    tocarSom(520 + combo * 60, 0.09, 'square', 0.05, 780 + combo * 60);

    macasComidas++;
    if(macasComidas % MACAS_POR_NIVEL === 0){
        subirNivel();
    }

    gerarComida();
    sortearEspecial();
}

function processarEspecial(cabeca){
    const item = especial;
    especial = null;

    if(item.tipo === 'dourada'){
        adicionarPontos(Math.round(50 * dificuldadeAtual.multiplicador), cabeca.x, cabeca.y);
        criarParticulas(cabeca.x, cabeca.y, '#ffd700', 22);
        tocarSequencia([880, 1109, 1319]);
    }else{
        adicionarPontos(Math.round(20 * dificuldadeAtual.multiplicador), cabeca.x, cabeca.y);
        efeitoLento = DURACAO_LENTO;
        criarParticulas(cabeca.x, cabeca.y, '#4cc9f0', 18);
        tocarSequencia([1200, 900, 600], 'sine');
    }
}

function adicionarPontos(quantidade, x, y){
    pontos += quantidade;

    textosFlutuantes.push({
        texto: '+' + quantidade,
        x: x * tamanhoQuadrado + tamanhoQuadrado / 2,
        y: y * tamanhoQuadrado,
        vida: 900,
        vidaMax: 900
    });

    if(pontos > recorde){
        recorde = pontos;
        recordeBatido = true;
        salvarRecorde();
    }
    atualizarPainel();
}

function subirNivel(){
    nivel++;
    avisoNivel = 1500;
    tocarSequencia([523, 659, 784]);

    // novos obstáculos (longe da cabeça para não ser injusto)
    for(let i = 0; i < dificuldadeAtual.obstaculosPorNivel && obstaculos.length < MAX_OBSTACULOS; i++){
        const cabeca = cobra[0];
        const celula = sortearCelulaLivre(c => Math.abs(c.x - cabeca.x) + Math.abs(c.y - cabeca.y) >= 5);
        if(celula){
            obstaculos.push(celula);
        }
    }
    atualizarPainel();
}

function sortearEspecial(){
    if(especial || Math.random() >= 0.2){
        return;
    }
    const celula = sortearCelulaLivre();
    if(!celula){
        return;
    }
    especial = {
        x: celula.x,
        y: celula.y,
        tipo: Math.random() < 0.6 ? 'dourada' : 'gelo',
        tempoRestante: DURACAO_ESPECIAL
    };
}

//===================================
// CÉLULAS LIVRES E GERAÇÃO DA COMIDA
//===================================
function celulasLivres(){
    const ocupadas = new Set();
    cobra.forEach(p => ocupadas.add(p.x + ',' + p.y));
    obstaculos.forEach(o => ocupadas.add(o.x + ',' + o.y));
    [comida, especial].forEach(item => {
        if(item){
            ocupadas.add(item.x + ',' + item.y);
        }
    });

    const livres = [];
    for(let y = 0; y < quantidadeQuadrados; y++){
        for(let x = 0; x < quantidadeQuadrados; x++){
            if(!ocupadas.has(x + ',' + y)){
                livres.push({ x, y });
            }
        }
    }
    return livres;
}

function sortearCelulaLivre(filtro){
    let livres = celulasLivres();
    if(filtro){
        livres = livres.filter(filtro);
    }
    if(livres.length === 0){
        return null;
    }
    return livres[Math.floor(Math.random() * livres.length)];
}

function gerarComida(){
    const celula = sortearCelulaLivre();
    if(!celula){
        // não sobrou nenhum espaço: o jogador venceu!
        vencerJogo();
        return;
    }
    comida = celula;
}

//============================
// FIM DE JOGO / VITÓRIA
//============================
function fimDeJogo(){
    estado = 'fim';
    tremor = 14;
    tocarSom(300, 0.5, 'sawtooth', 0.08, 60);
}

function vencerJogo(){
    estado = 'vitoria';
    tocarSequencia([523, 659, 784, 1047]);
}

//============================
// MUDAR DIREÇÃO (com fila de comandos)
//============================
function mudarDirecao(novaDirecao){
    if(estado !== 'jogando'){
        return;
    }

    // compara com o último comando da fila (ou com a direção atual)
    const ultima = filaDirecoes.length > 0 ? filaDirecoes[filaDirecoes.length - 1] : direcao;

    if(novaDirecao === ultima || novaDirecao === opostas[ultima]){
        return;
    }
    if(filaDirecoes.length < 2){
        filaDirecoes.push(novaDirecao);
    }
}

//============================
// PAUSAR O JOGO
//============================
function pausarJogo(){
    if(estado === 'jogando'){
        estado = 'pausado';
    }else if(estado === 'pausado'){
        estado = 'jogando';
    }
}

//============================
// PAINEL (HTML)
//============================
function atualizarPainel(){
    elPontos.textContent = pontos;
    elRecorde.textContent = recorde;
    elNivel.textContent = nivel;
    elCombo.textContent = combo > 0 ? 'x' + combo : '-';
}

//============================
// PARTÍCULAS
//============================
function criarParticulas(x, y, cor, quantidade){
    const cx = x * tamanhoQuadrado + tamanhoQuadrado / 2;
    const cy = y * tamanhoQuadrado + tamanhoQuadrado / 2;
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

//=============================
// DESENHO
//=============================
function desenhar(){
    ctx.save();
    if(tremor > 0.5){
        ctx.translate((Math.random() - 0.5) * tremor, (Math.random() - 0.5) * tremor);
    }

    desenharTabuleiro();
    desenharObstaculos();
    desenharComida();
    desenharEspecial();
    desenharCobra();
    desenharParticulas();
    desenharAvisos();

    ctx.restore();

    desenharTelas();
}

function escreverTexto(texto, y, tamanho, cor = 'white', negrito = true, x = tamanhoCanvas / 2, alinhamento = 'center'){
    ctx.font = (negrito ? 'bold ' : '') + tamanho + 'px Arial';
    ctx.fillStyle = cor;
    ctx.textAlign = alinhamento;
    ctx.textBaseline = 'middle';
    ctx.fillText(texto, x, y);
}

function retanguloArredondado(x, y, w, h, r){
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y,     x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x,     y + h, r);
    ctx.arcTo(x,     y + h, x,     y,     r);
    ctx.arcTo(x,     y,     x + w, y,     r);
    ctx.closePath();
}

function desenharTabuleiro(){
    // fundo xadrez
    for(let y = 0; y < quantidadeQuadrados; y++){
        for(let x = 0; x < quantidadeQuadrados; x++){
            ctx.fillStyle = (x + y) % 2 === 0 ? '#1f2d3d' : '#243447';
            ctx.fillRect(x * tamanhoQuadrado, y * tamanhoQuadrado, tamanhoQuadrado, tamanhoQuadrado);
        }
    }

    // borda: vermelha = parede mortal, azul = pode atravessar
    ctx.lineWidth = 4;
    ctx.strokeStyle = atravessarParedes ? 'rgba(102, 126, 234, 0.6)' : 'rgba(231, 76, 60, 0.8)';
    ctx.strokeRect(2, 2, tamanhoCanvas - 4, tamanhoCanvas - 4);
}

function desenharObstaculos(){
    obstaculos.forEach(o => {
        const px = o.x * tamanhoQuadrado;
        const py = o.y * tamanhoQuadrado;
        ctx.fillStyle = '#6c757d';
        retanguloArredondado(px + 1, py + 1, tamanhoQuadrado - 2, tamanhoQuadrado - 2, 4);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fillRect(px + 4, py + 4, tamanhoQuadrado - 8, 4);
    });
}

function desenharComida(){
    if(!comida){
        return;
    }
    const cx = comida.x * tamanhoQuadrado + tamanhoQuadrado / 2;
    const cy = comida.y * tamanhoQuadrado + tamanhoQuadrado / 2;

    // maçã
    ctx.fillStyle = '#e63946';
    ctx.beginPath();
    ctx.arc(cx, cy + 1, tamanhoQuadrado / 2 - 3, 0, Math.PI * 2);
    ctx.fill();

    // brilho
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.beginPath();
    ctx.arc(cx - 3, cy - 2, 2, 0, Math.PI * 2);
    ctx.fill();

    // folha
    ctx.fillStyle = '#2ecc71';
    ctx.beginPath();
    ctx.ellipse(cx + 3, cy - 7, 3.5, 1.8, -0.5, 0, Math.PI * 2);
    ctx.fill();
}

function desenharEspecial(){
    if(!especial){
        return;
    }
    // pisca nos últimos 2 segundos para avisar que vai sumir
    if(especial.tempoRestante < 2000 && Math.floor(performance.now() / 150) % 2 === 0){
        return;
    }

    const cx = especial.x * tamanhoQuadrado + tamanhoQuadrado / 2;
    const cy = especial.y * tamanhoQuadrado + tamanhoQuadrado / 2;
    const pulso = Math.sin(performance.now() / 120) * 1.2;
    const raio = tamanhoQuadrado / 2 - 3 + pulso;

    if(especial.tipo === 'dourada'){
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.arc(cx, cy, raio, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ff9f1c';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.beginPath();
        ctx.arc(cx - 3, cy - 3, 2, 0, Math.PI * 2);
        ctx.fill();
    }else{
        ctx.fillStyle = '#4cc9f0';
        ctx.beginPath();
        ctx.arc(cx, cy, raio, 0, Math.PI * 2);
        ctx.fill();
        // floco de neve simples
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1.5;
        for(let k = 0; k < 3; k++){
            const ang = k * Math.PI / 3;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(ang) * 5, cy + Math.sin(ang) * 5);
            ctx.lineTo(cx - Math.cos(ang) * 5, cy - Math.sin(ang) * 5);
            ctx.stroke();
        }
    }

    // anel mostrando o tempo restante
    const fracao = especial.tempoRestante / DURACAO_ESPECIAL;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, tamanhoQuadrado / 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fracao);
    ctx.stroke();
}

function desenharCobra(){
    const matiz = efeitoLento > 0 ? 195 : 130;   // fica azulada durante o gelo

    // do rabo para a cabeça, para a cabeça ficar por cima
    for(let i = cobra.length - 1; i >= 0; i--){
        const p = cobra[i];
        const t = cobra.length > 1 ? i / (cobra.length - 1) : 0;   // 0 = cabeça, 1 = rabo

        ctx.fillStyle = i === 0
            ? 'hsl(' + matiz + ', 70%, 62%)'
            : 'hsl(' + matiz + ', 60%, ' + (52 - t * 18) + '%)';

        retanguloArredondado(
            p.x * tamanhoQuadrado + 1,
            p.y * tamanhoQuadrado + 1,
            tamanhoQuadrado - 2,
            tamanhoQuadrado - 2,
            6
        );
        ctx.fill();

        if(i === 0){
            desenharOlhos(p);
        }
    }
}

function desenharOlhos(p){
    const cx = p.x * tamanhoQuadrado + tamanhoQuadrado / 2;
    const cy = p.y * tamanhoQuadrado + tamanhoQuadrado / 2;

    let olhos;
    switch(direcao){
        case 'cima':     olhos = [[-4, -4], [4, -4]]; break;
        case 'baixo':    olhos = [[-4,  4], [4,  4]]; break;
        case 'esquerda': olhos = [[-4, -4], [-4, 4]]; break;
        default:         olhos = [[ 4, -4], [ 4, 4]]; break;
    }

    olhos.forEach(([ox, oy]) => {
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(cx + ox, cy + oy, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(cx + ox, cy + oy, 1.5, 0, Math.PI * 2);
        ctx.fill();
    });
}

function desenharParticulas(){
    particulas.forEach(p => {
        ctx.globalAlpha = Math.max(0, p.vida / p.vidaMax);
        ctx.fillStyle = p.cor;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;
}

function desenharAvisos(){
    // pontos flutuantes
    textosFlutuantes.forEach(t => {
        ctx.globalAlpha = Math.max(0, t.vida / t.vidaMax);
        escreverTexto(t.texto, t.y, 14, '#ffffff', true, t.x, 'center');
    });
    ctx.globalAlpha = 1;

    // efeito de gelo ativo
    if(efeitoLento > 0){
        escreverTexto('LENTO ' + (efeitoLento / 1000).toFixed(1) + 's', 18, 14, '#4cc9f0', true, 10, 'left');
    }

    // aviso de novo nível
    if(avisoNivel > 0){
        ctx.globalAlpha = Math.min(1, avisoNivel / 400);
        escreverTexto('NÍVEL ' + nivel + '!', 110, 38, '#ffd166');
        ctx.globalAlpha = 1;
    }
}

// Telas sobrepostas (início, pausa, fim, vitória)
function desenharTelas(){
    if(estado === 'jogando'){
        return;
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
    ctx.fillRect(0, 0, tamanhoCanvas, tamanhoCanvas);

    if(estado === 'inicial'){
        escreverTexto('COBRINHA', 130, 40);
        escreverTexto('Dificuldade: ' + dificuldadeAtual.nome, 185, 18, '#ffd166');
        escreverTexto(atravessarParedes ? 'Sem paredes' : 'Com paredes', 212, 16, '#cccccc', false);
        escreverTexto('Pressione ENTER ou toque aqui', 265, 16);
    }else if(estado === 'pausado'){
        escreverTexto('PAUSADO', 190, 40);
        escreverTexto('ESPAÇO para continuar', 235, 16, '#cccccc', false);
    }else if(estado === 'fim'){
        escreverTexto('FIM DE JOGO', 120, 40, '#ff6b6b');
        escreverTexto('Pontuação: ' + pontos, 175, 22);
        escreverTexto('Nível: ' + nivel, 205, 18, '#cccccc', false);
        if(recordeBatido){
            escreverTexto('NOVO RECORDE!', 245, 24, '#ffd166');
        }
        escreverTexto('ENTER para jogar de novo', 295, 16);
    }else if(estado === 'vitoria'){
        escreverTexto('VOCÊ VENCEU!', 130, 40, '#ffd166');
        escreverTexto('A cobra ocupou o tabuleiro todo', 185, 16, '#cccccc', false);
        escreverTexto('Pontuação: ' + pontos, 225, 22);
        escreverTexto('ENTER para jogar de novo', 295, 16);
    }
}

//===========================
// CONTROLE DE TECLADO
//===========================
document.addEventListener('keydown', function(event){
    if(event.ctrlKey || event.metaKey || event.altKey){
        return;   // não atrapalha atalhos do navegador (Ctrl+R, etc.)
    }

    const tecla = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const direcaoTecla = mapaTeclas[tecla];
    const teclaDoJogo = direcaoTecla || tecla === 'Enter' || tecla === ' ' || tecla === 'p' || tecla === 'r';

    if(!teclaDoJogo){
        return;
    }

    event.preventDefault();

    // tira o foco de botões/selects: evita que Espaço/Enter "cliquem" no botão focado
    if(document.activeElement && document.activeElement !== document.body){
        document.activeElement.blur();
    }

    if(event.repeat){
        return;
    }

    if(direcaoTecla){
        mudarDirecao(direcaoTecla);
    }else if(tecla === 'Enter' || tecla === 'r'){
        iniciarJogo();
    }else if(tecla === ' '){
        if(estado === 'jogando' || estado === 'pausado'){
            pausarJogo();
        }else{
            iniciarJogo();
        }
    }else if(tecla === 'p'){
        pausarJogo();
    }
});

//===========================
// BOTÕES, SELECTS E TECLADO NA TELA
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

// trocar dificuldade/modo volta para a tela inicial
selDificuldade.addEventListener('change', function(){
    this.blur();
    voltarParaTelaInicial();
});

chkAtravessar.addEventListener('change', function(){
    this.blur();
    voltarParaTelaInicial();
});

document.querySelectorAll('.tecla[data-dir]').forEach(botao => {
    botao.addEventListener('pointerdown', function(event){
        event.preventDefault();
        mudarDirecao(botao.dataset.dir);
    });
});

//===========================
// DESLIZAR O DEDO (SWIPE) NO CANVAS
//===========================
let toque = null;

canvas.addEventListener('pointerdown', function(event){
    toque = { x: event.clientX, y: event.clientY, moveu: false };
});

canvas.addEventListener('pointermove', function(event){
    if(!toque){
        return;
    }
    const dx = event.clientX - toque.x;
    const dy = event.clientY - toque.y;

    if(Math.max(Math.abs(dx), Math.abs(dy)) >= 20){
        toque.moveu = true;
        if(Math.abs(dx) > Math.abs(dy)){
            mudarDirecao(dx > 0 ? 'direita' : 'esquerda');
        }else{
            mudarDirecao(dy > 0 ? 'baixo' : 'cima');
        }
        toque.x = event.clientX;
        toque.y = event.clientY;
    }
});

canvas.addEventListener('pointerup', function(){
    // toque simples: inicia ou retoma o jogo
    if(toque && !toque.moveu){
        if(estado === 'pausado'){
            pausarJogo();
        }else if(estado !== 'jogando'){
            iniciarJogo();
        }
    }
    toque = null;
});

canvas.addEventListener('pointercancel', function(){ toque = null; });
canvas.addEventListener('pointerleave',  function(){ toque = null; });

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