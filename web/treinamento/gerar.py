# -*- coding: utf-8 -*-
# Gera as três páginas de treinamento do A360 (arquiteta, coordenação, gerência) com a identidade visual do A360/rucelle.
import html, json, os
import sys
OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/claude-0/-home-claude/938adbec-e3f0-572f-8193-a6f83899d529/scratchpad/treino"
DENTRO = len(sys.argv) > 1
API = "api" in sys.argv  # variante para quando a sincronização automática pela API do Vobi estiver ativa (T-218)
URL = "https://architecture-360-production.up.railway.app"

CSS = """
:root{--vinho:#5b0d0d;--vinho-2:#7a1c1c;--rose:#f7cfc4;--rose-2:#fbe9e3;--nude:#f6efe9;--terracota:#c8432a;--grafite:#2b2b2b;
--bg:#f6efe9;--card:#fff;--surface-2:#fbf8f6;--line:#e6dcd5;--txt:#2b2b2b;--txt-2:#4d4643;--muted:#6f6763;
--ok:#2f6b3a;--ok-bg:#e6f1e8;--warn:#9a5a00;--warn-bg:#fff1d6;--bad:#b3261e;--bad-bg:#fbe5e3;--vinho-3:#3f0707;--side-txt:#f1dcd5;--side-mut:#d7a99b;--font:"Montserrat","Segoe UI",system-ui,sans-serif;--display:"Fraunces",Georgia,"Times New Roman",serif}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--vinho:#e8a3a3;--vinho-2:#f0b9b9;--rose:#4a2a24;--rose-2:#3a2420;--nude:#1f1816;--terracota:#e3936a;--grafite:#f1e9e4;--bg:#1f1816;--card:#2a211e;--surface-2:#332925;--line:#43362f;--txt:#f1e9e4;--txt-2:#cfc1b9;--muted:#9a8d86;--ok:#8fd19a;--ok-bg:#203826;--warn:#e5b56a;--warn-bg:#3c2e18;--bad:#f08c86;--bad-bg:#45201d;color-scheme:dark}}
:root[data-theme="dark"]{--vinho:#e8a3a3;--vinho-2:#f0b9b9;--rose:#4a2a24;--rose-2:#3a2420;--nude:#1f1816;--terracota:#e3936a;--grafite:#f1e9e4;--bg:#1f1816;--card:#2a211e;--surface-2:#332925;--line:#43362f;--txt:#f1e9e4;--txt-2:#cfc1b9;--muted:#9a8d86;--ok:#8fd19a;--ok-bg:#203826;--warn:#e5b56a;--warn-bg:#3c2e18;--bad:#f08c86;--bad-bg:#45201d;color-scheme:dark}
*{box-sizing:border-box}body{background:var(--bg);color:var(--txt);font-family:var(--font);font-size:15px;line-height:1.55;margin:0;padding-block:0 0;padding-left:0;padding-right:0}
a{color:var(--vinho)}h1,h2,h3{text-wrap:balance;margin:0}
.shell{display:grid;grid-template-columns:15.5rem minmax(0,1fr);min-height:100vh}
@media (max-width:860px){.shell{grid-template-columns:1fr}.side{position:static!important;height:auto!important}.side .nav{display:none}.side.aberta .nav{display:flex}.side .menu-btn{display:inline-flex!important}}
.side{position:sticky;top:0;height:100vh;overflow-y:auto;background:linear-gradient(180deg,var(--vinho-3) 0%,#5b0d0d 100%);color:var(--side-txt);display:flex;flex-direction:column;gap:1rem;padding:1.3rem .9rem 1rem}
.side .marca{display:flex;align-items:flex-start;justify-content:space-between;gap:.6rem;padding:0 .4rem}.side .marca b{display:block;font-family:var(--display);font-weight:600;font-size:1.55rem;letter-spacing:-.015em;color:#fff;line-height:1}.side .marca small{display:block;margin-top:.3rem;font-size:.62rem;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:var(--side-mut)}
.side .menu-btn{display:none;border:1px solid rgba(255,255,255,.25);background:transparent;color:#fff;border-radius:8px;padding:.35rem .7rem;font:inherit;font-size:.8rem;cursor:pointer}
.nav{display:flex;flex-direction:column;gap:.15rem;font-size:.86rem;flex:1}
.nav a{color:var(--side-txt);text-decoration:none;padding:.45rem .7rem;border-radius:9px;display:flex;justify-content:space-between;gap:.5rem}
.nav a:hover{background:rgba(255,255,255,.08);color:#fff}.nav a.feito{color:#fff}.nav a.feito::after{content:"✓";color:#8fd19a}.nav a.ativa{background:#fff;color:#5b0d0d;font-weight:600}.nav .grupo{font-size:.64rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--side-mut);margin:.9rem .7rem .3rem}
.side .prog{border-top:1px solid rgba(255,255,255,.12);padding-top:.8rem;font-size:.76rem;color:var(--side-mut);display:grid;gap:.4rem}.side .prog .bar{height:6px;border-radius:999px;background:rgba(255,255,255,.14);overflow:hidden}.side .prog .bar i{display:block;height:100%;width:0;background:#e35336;transition:width .3s}.side .prog b{color:#fff}
.side .voltar{color:#fff;font-size:.82rem;text-decoration:none;padding:.4rem .7rem;border:1px solid rgba(255,255,255,.25);border-radius:8px;text-align:center}.side .trilhas{font-size:.76rem;color:var(--side-mut);display:grid;gap:.2rem}.side .trilhas a{color:#f1dcd5}
.conteudo{min-width:0;padding-block:1.6rem 4rem;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.conteudo>main{max-width:1100px;margin:0 auto}
main{display:grid;gap:2.2rem;min-width:0}
.eyebrow{font-size:.68rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--terracota)}
h1{font-family:var(--display);font-weight:600;letter-spacing:-.015em;font-size:clamp(1.7rem,3vw,2.4rem);line-height:1.12;margin:.2rem 0 .5rem}h2{font-family:var(--display);font-weight:600;letter-spacing:-.01em;font-size:1.45rem;margin-bottom:.3rem}h3{font-size:.98rem;margin-bottom:.25rem}
p{margin:0;max-width:72ch;color:var(--txt-2)}.lead{color:var(--txt);font-size:1.02rem}
section{scroll-margin-top:24px;display:grid;gap:1rem}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:1rem 1.1rem;min-width:0}
.grid{display:grid;gap:.9rem;grid-template-columns:repeat(auto-fit,minmax(230px,1fr))}
.pill{display:inline-block;font-size:.72rem;font-weight:600;padding:.2rem .6rem;border-radius:999px;background:var(--rose-2);color:var(--vinho);margin:.1rem .2rem .1rem 0}
figure{margin:0;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
figure img{display:block;width:100%;max-width:100%;height:auto;cursor:zoom-in}figure.alta img{max-height:560px;object-fit:cover;object-position:top}
figcaption{font-size:.78rem;color:var(--muted);padding:.5rem .9rem;border-top:1px solid var(--line)}
ol.passos{margin:0;padding-left:1.2rem;display:grid;gap:.35rem;color:var(--txt-2)}ol.passos li::marker{color:var(--terracota);font-weight:700}
ul.lista{margin:0;padding-left:1.1rem;display:grid;gap:.3rem;color:var(--txt-2)}
.regra{border-left:3px solid var(--vinho);background:var(--card);border-radius:0 10px 10px 0;padding:.5rem .9rem;font-size:.88rem}.regra b{font-size:.64rem;letter-spacing:.14em;text-transform:uppercase;color:var(--vinho);margin-right:.5rem}
.regra.nao{border-color:var(--bad)}.regra.nao b{color:var(--bad)}
details{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:.55rem .9rem}summary{cursor:pointer;font-weight:600;font-size:.9rem}details[open]{padding-bottom:.9rem}details>*:not(summary){margin-top:.6rem}
.feito-btn{display:inline-flex;align-items:center;gap:.5rem;border:1px solid var(--line);background:var(--card);color:var(--txt);border-radius:999px;padding:.4rem .9rem;font:inherit;font-size:.82rem;cursor:pointer}.feito-btn.on{background:var(--ok-bg);color:var(--ok);border-color:transparent}
.quiz{display:grid;gap:.9rem}.q{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:.9rem 1rem}.q p{font-weight:600;color:var(--txt)}.q button{display:block;width:100%;text-align:left;margin-top:.4rem;border:1px solid var(--line);background:var(--surface-2);color:var(--txt);border-radius:8px;padding:.45rem .7rem;font:inherit;font-size:.88rem;cursor:pointer}
.q button.certa{background:var(--ok-bg);color:var(--ok);border-color:transparent}.q button.errada{background:var(--bad-bg);color:var(--bad);border-color:transparent}.q .exp{font-size:.82rem;color:var(--muted);margin-top:.4rem;display:none}.q.respondida .exp{display:block}
.lightbox{position:fixed;inset:0;background:rgba(43,43,43,.86);display:none;align-items:flex-start;justify-content:center;overflow:auto;padding:2rem 1rem;z-index:50}.lightbox.on{display:flex}.lightbox img{max-width:min(1366px,100%);height:auto;border-radius:8px}
.tabela{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:.86rem}th,td{text-align:left;padding:.45rem .6rem;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.rodape{font-size:.78rem;color:var(--muted);border-top:1px solid var(--line);padding-top:1rem}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
"""

JS = """
(function(){
  var chave='a360-treino-'+(document.getElementById('raiz')||{dataset:{}}).dataset.perfil;var feito={};try{feito=JSON.parse(localStorage.getItem(chave)||'{}')}catch(e){}
  var secs=[].slice.call(document.querySelectorAll('section[data-mod]'));
  function salvar(){try{localStorage.setItem(chave,JSON.stringify(feito))}catch(e){}}
  function render(){var n=0;secs.forEach(function(s){var id=s.dataset.mod,b=s.querySelector('.feito-btn'),a=document.querySelector('.nav a[href="#'+s.id+'"]');var on=!!feito[id];if(on)n++;if(b){b.classList.toggle('on',on);b.textContent=on?'✓ Já sei usar':'Marcar como entendido'}if(a)a.classList.toggle('feito',on)});
    var pct=secs.length?Math.round(n/secs.length*100):0;document.querySelector('.prog i').style.width=pct+'%';document.querySelector('.prog b').textContent=n+'/'+secs.length}
  var links=[].slice.call(document.querySelectorAll('.nav a'));function ativa(){var y=window.scrollY+120,cur=null;document.querySelectorAll('section[id]').forEach(function(sx){if(sx.offsetTop<=y)cur=sx.id});links.forEach(function(a){a.classList.toggle('ativa',cur&&a.getAttribute('href')==='#'+cur)})}window.addEventListener('scroll',ativa,{passive:true});ativa();
  secs.forEach(function(s){var b=s.querySelector('.feito-btn');if(b)b.addEventListener('click',function(){feito[s.dataset.mod]=!feito[s.dataset.mod];salvar();render()})});
  render();
  var lb=document.querySelector('.lightbox'),lbi=lb.querySelector('img');document.querySelectorAll('figure img').forEach(function(im){im.addEventListener('click',function(){lbi.src=im.src;lbi.alt=im.alt;lb.classList.add('on')})});lb.addEventListener('click',function(){lb.classList.remove('on')});document.addEventListener('keydown',function(e){if(e.key==='Escape')lb.classList.remove('on')});
  document.querySelectorAll('.q').forEach(function(q){var certa=q.dataset.certa;q.querySelectorAll('button').forEach(function(b,i){b.addEventListener('click',function(){if(q.classList.contains('respondida'))return;q.classList.add('respondida');b.classList.add(String(i)===certa?'certa':'errada');if(String(i)!==certa)q.querySelectorAll('button')[Number(certa)].classList.add('certa')})})});
})();
"""

def fig(img, cap, alta=False):
    return f'<figure class="{"alta" if alta else ""}"><img src="shots/{img}.jpg" alt="{html.escape(cap)}" loading="lazy"><figcaption>{cap}</figcaption></figure>'
def passos(itens): return '<ol class="passos">' + ''.join(f'<li>{i}</li>' for i in itens) + '</ol>'
def lista(itens): return '<ul class="lista">' + ''.join(f'<li>{i}</li>' for i in itens) + '</ul>'
def regra(txt, nao=False, rot=None): return f'<div class="regra {"nao" if nao else ""}"><b>{rot or ("não" if nao else "regra")}</b>{txt}</div>'
def det(t, corpo): return f'<details><summary>{t}</summary>{corpo}</details>'

def secao(sid, titulo, sub, corpo, mod=True):
    btn = '<div><button class="feito-btn" type="button">Marcar como entendido</button></div>' if mod else ''
    return f'<section id="{sid}" {"data-mod="+chr(34)+sid+chr(34) if mod else ""}><div><div class="eyebrow">{sub}</div><h2>{titulo}</h2></div>{corpo}{btn}</section>'

def quiz(perguntas):
    out = ['<div class="quiz">']
    for p, ops, certa, exp in perguntas:
        out.append(f'<div class="q" data-certa="{certa}"><p>{p}</p>' + ''.join(f'<button type="button">{o}</button>' for o in ops) + f'<div class="exp">{exp}</div></div>')
    out.append('</div>'); return ''.join(out)

COMUM_INTRO = f"""
<p class="lead">O Architecture 360 (A360) é a central de trabalho da equipe de arquitetura da rucelle. Ele mostra, num só lugar, o que está no Vobi — projetos, tarefas, prazos, responsáveis — e acrescenta o que o Vobi não tem: agenda, reuniões com ata, entregáveis com aprovação do cliente, linha do tempo e alertas.</p>
<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(360px,1fr))">
<div class="card"><h3>De onde vêm os dados</h3><p>{'Do Vobi, <b>automaticamente, todos os dias de manhã</b>, pela API: ninguém exporta nem importa nada. A data da última sincronização aparece no topo de cada tela ("dados do Vobi de …"). O que você mudar no Vobi aparece aqui na sincronização seguinte.' if API else 'Do Vobi, <b>todos os dias de manhã</b>: a gestão exporta Projetos e Tarefas e importa no A360. A data da exportação aparece no topo de cada tela ("dados do Vobi de …"). O que você mudar no Vobi aparece aqui na importação seguinte.'}</p></div>
<div class="card"><h3>O A360 não altera o Vobi</h3><p>Tudo que vem do Vobi é <b>somente leitura</b> (o selo "Vobi · somente leitura" fica no topo). Tarefa, prazo e responsável continuam sendo editados no Vobi, como hoje.</p></div>
<div class="card"><h3>O que é registrado no A360</h3><p>Compromissos da sua Google Agenda, reuniões (pauta, ata, decisões, encaminhamentos), entregáveis e aprovações do cliente, comentários e históricos. Nada disso vai para o Vobi nem para o cliente.</p></div>
<div class="card"><h3>Não é avaliação</h3><p>Os números do A360 descrevem o trabalho como está registrado no Vobi. Não há ranking, nota ou cobrança automática. Dado que falta na fonte aparece como limitação, nunca como culpa.</p></div>
</div>
"""

PRIMEIRO_ACESSO = """
<div class="grid">
<div>""" + passos([
 f'Abra <a href="{URL}" target="_blank" rel="noreferrer">{URL.replace("https://","")}</a> (funciona no computador e no celular).',
 'Entre com seu e-mail @rucelle.com.br e a <b>senha provisória</b> que você recebeu.',
 'O sistema pede uma senha nova (mínimo 10 caracteres). Guarde a nova; a provisória deixa de valer.',
 'Para trocar a senha depois: botão <b>Senha</b> no canto superior direito.',
 'Esqueceu a senha? Peça ao administrador (Rodrigo) uma redefinição: ele gera uma nova provisória.',
]) + """</div>
""" + fig("login", "Tela de entrada: e-mail @rucelle e senha.") + fig("senha", "Primeiro acesso: o sistema obriga a definir uma senha sua antes de qualquer tela.") + """
</div>
"""

# -------------------------------------------------------------------- ARQUITETA
ARQ = dict(
 perfil="arquiteta", titulo="Treinamento A360 — Arquitetas", cab="Para as arquitetas",
 intro="Esta página é para quem executa os projetos. Você vai usar o A360 todos os dias para ver suas prioridades, registrar reuniões e entregáveis e manter sua agenda; o Vobi continua sendo onde a tarefa é editada.",
 secoes=[
  ("meu-dia", "Meu Dia", "Sua tela inicial", """
<p>Abre toda vez que você entra. Mostra só o que é seu: tarefas em que você é responsável no Vobi e projetos em que você está como colaboradora.</p>
""" + fig("arq-meu-dia", "Meu Dia de uma arquiteta: atrasadas, vencendo em 7 dias, sem prazo, prioridades e projetos.") + """
<div class="grid"><div class="card"><h3>Como ler</h3>""" + lista([
 '<b>Minhas atrasadas</b>: tarefas abertas cujo prazo no Vobi já passou (agrupadas por mais de 30 dias, 8–30, 1–7).',
 '<b>Vencem em 7 dias</b>: o que precisa sair esta semana; "entregas" são as tarefas de etapas de entrega.',
 '<b>Sem prazo</b>: tarefas suas sem data no Vobi — o A360 não consegue acompanhar essas; se forem suas, coloque o prazo no Vobi.',
 '<b>Prioridades</b>: atrasadas e próximas, com o link "Vobi ↗" que abre a tarefa na origem.',
 'Botões 7 / 14 / 30 dias mudam a janela de "próximas".']) + """</div>
<div class="card"><h3>Rotina sugerida</h3>""" + passos([
 'De manhã, abra o Meu Dia e veja atrasadas e próximas.',
 'Terminou algo? Conclua <b>no Vobi</b>; amanhã já aparece atualizado aqui.',
 'Prazo errado ou tarefa sem prazo: ajuste no Vobi.',
 'Marcador "CALC." = número calculado pelo A360 a partir do Vobi; "?" explica cada limitação.']) + """</div></div>
""" + regra("O A360 não envia lembretes nem cobranças. Ele é a sua visão; quem acompanha prazos com você continua sendo a coordenação.")),
  ("tarefas", "Tarefas", "Lista completa, com filtros", """
<p>Todas as suas tarefas do Vobi, com busca, filtros por prazo, etapa (com o nome exatamente como está no Vobi), projeto e cliente, ordenação e paginação.</p>
""" + fig("arq-tarefas", "Lista de tarefas com filtros. Cada linha tem o link para a tarefa no Vobi.") + lista([
 'Filtro <b>Prazo</b>: abertas, atrasadas, vence hoje, 7 dias, sem prazo, concluídas.',
 'Filtro <b>Etapa</b>: usa o nome original do Vobi ("02: CONCEITO/LAYOUT", "ESTUDO VOLUMÉTRICO"…).',
 'Os links do Meu Dia e do projeto abrem esta lista já filtrada.'])),
  ("projetos", "Projetos e linha do tempo", "Tudo de um projeto num lugar", """
<p>Você vê os projetos em que participa. Dentro do projeto: dados do Vobi, todas as tarefas (abertas e concluídas, com a etapa original), reuniões, entregáveis, alertas e a linha do tempo.</p>
""" + fig("arq-projetos", "Lista de projetos da arquiteta (só os seus), com situação e atrasos.") + fig("arq-projeto", "Página do projeto: cliente, tarefas por etapa, reuniões, entregáveis e alertas.", alta=True) + fig("arq-linha-do-tempo", "Linha do tempo: reuniões, decisões, aprovações, entregáveis (A360) e mudanças de tarefas (Vobi), em ordem, com filtros por origem.", alta=True) + lista([
 'Botão <b>Vobi ↗</b> abre o projeto na origem para editar.',
 'Da página do projeto você registra reunião e entregável já ligados a ele.',
 'A linha do tempo é a história do projeto: use-a antes de uma reunião com o cliente para lembrar o que foi decidido e aprovado.'])),
  ("agenda", "Agenda", "Sua Google Agenda dentro do A360", """
<p>A Agenda mostra e edita os compromissos da <b>sua</b> Google Agenda. Cada pessoa conecta a própria conta; ninguém vê o compromisso privado de ninguém (aparece só como "ocupado").</p>
""" + fig("arq-agenda", "Agenda antes de conectar: clique em Conectar e autorize com sua conta @rucelle.") + passos([
 'Clique em <b>Conectar Google Agenda</b> e autorize com seu e-mail @rucelle (só uma vez).',
 'Veja mês, semana ou dia. Crie, edite ou exclua compromissos: tudo reflete na sua Google Agenda e vice-versa.',
 'Compromisso ligado a um projeto: escolha o projeto ao criar; a coordenação também pode associar depois.',
 'Reunião com cliente? A partir do compromisso, clique em <b>Registrar reunião</b> para criar a reunião no A360 já com título, horário e participantes.',
 'Para desconectar: botão na própria Agenda. O A360 nunca guarda sua senha do Google.'])),
  ("reunioes", "Reuniões", "Pauta, ata, decisões e encaminhamentos", """
<p>Toda reunião com cliente (ou interna relevante) é registrada aqui, ligada ao projeto. A ata pode ser escrita à mão ou gerada automaticamente a partir da transcrição do Google Meet.</p>
""" + fig("arq-reunioes", "Lista de reuniões: próximas e anteriores, com decisões e encaminhamentos abertos.") + fig("arq-reuniao-nova", "Nova reunião: título, projeto, data, participantes e pauta. Pode criar também o compromisso no Google com Meet.", alta=True) + fig("coord-reuniao", "Reunião registrada: ata estruturada, decisões, aprovações e encaminhamentos com responsável e prazo; cada item traz o trecho da transcrição que o originou.", alta=True) + passos([
 'Registre a reunião antes (pauta) — pelo projeto, pela Agenda ou em Reuniões › Nova.',
 'Depois da reunião, se gravou no Meet: baixe a transcrição do Drive (Documento Google › exportar .docx ou .txt) e envie em <b>Transcrição</b>. A IA gera a ata com resumo, decisões, aprovações e encaminhamentos.',
 'Confira cada item extraído: <b>Confirmar</b> os corretos, descartar os errados. Itens marcados "confirmar" são sugestões, não registros.',
 'Sem transcrição: escreva a ata e registre decisões, aprovações e encaminhamentos à mão.',
 'Marque a reunião como <b>realizada</b>. O histórico guarda tudo, inclusive versões da ata.']) + regra("Encaminhamento no A360 é registro de acompanhamento. Ele não cria tarefa no Vobi e não gera cobrança para ninguém.") + regra("A IA não inventa: cada item mostra o trecho de origem e o nível de confiança (mencionado, síntese, inferência, a confirmar). Se um item não tem trecho, desconfie e descarte.", nao=False, rot="atenção")),
  ("entregaveis", "Entregáveis", "O que vai ao cliente e a prova da aprovação", """
<p>Layout, apresentação, caderno executivo, imagens 3D: cada entregável tem versões, passa pela revisão interna da coordenação e recebe a resposta do cliente <b>com evidência</b>. É registro interno; nada é enviado ao cliente por aqui.</p>
""" + fig("arq-entregavel-novo", "Novo entregável: título, tipo, responsável, projeto (do Vobi) e o que o cliente precisa aprovar.") + fig("arq-entregavel", "Entregável com versão, aprovação interna, resposta do cliente com evidência, situação, comentários e histórico.", alta=True) + fig("arq-entregavel-resposta-cliente", "Registrar a resposta do cliente: decisão, como chegou (e-mail, mensagem, ata, item de reunião), data, quem respondeu e o trecho ou arquivo.", alta=True) + passos([
 'Em <b>Entregáveis › + Novo entregável</b> (ou pela página do projeto): título, tipo, descrição.',
 'Registre a <b>versão</b>: link do Drive ou arquivo (até 15 MB) e o que mudou.',
 'Clique em <b>Enviar para revisão interna</b>. A coordenação aprova ou pede ajustes.',
 'Aprovado internamente? Envie ao cliente pelo canal habitual e marque <b>enviado ao cliente</b>.',
 'Quando o cliente responder, registre a resposta com a evidência: cole o e-mail/mensagem, anexe o print ou aponte o item de aprovação da reunião.',
 'Nova versão depois de uma aprovação volta automaticamente para revisão interna.']) + regra("Aprovação do cliente sem evidência não é registrada — o sistema recusa. Isso protege você: fica provado o que foi aprovado, quando e por quem.") + regra("Nunca registre uma aprovação que ainda não aconteceu, nem marque 'enviado ao cliente' antes de enviar.", nao=True)),
  ("permissoes", "O que você vê e o que não vê", "Permissões do perfil arquiteta", """
<div class="grid"><div class="card"><h3>Você vê</h3>""" + lista(['Suas tarefas e seus projetos (colaboradora ou responsável no Vobi).','Sua Agenda.','Reuniões que você criou, de que participa ou dos seus projetos.','Entregáveis dos seus projetos.','Alertas dos seus projetos (só leitura).','Qualidade dos dados, Clientes e Importação (consulta).']) + """</div>
<div class="card"><h3>Você não vê</h3>""" + lista(['Painel de Gestão, Capacidade e fluxo, Pessoas, Usuários.','Projetos e tarefas de outras pessoas.','Tratamento de alertas e aprovação interna de entregáveis (coordenação/gestão).']) + """</div></div>
""" + fig("sem-permissao", "Tentou abrir uma tela de gestão? Aparece esta mensagem. Não é erro: é o perfil.")),
 ],
 quiz=[
  ("Terminei uma tarefa. Onde eu marco como concluída?", ["No A360, em Meu Dia", "No Vobi; o A360 atualiza na próxima importação", "Nos dois lugares"], 1, "O Vobi é a origem e o A360 só lê. A conclusão aparece no A360 na importação seguinte (todo dia de manhã)."),
  ("O cliente aprovou o layout por WhatsApp. O que faço no A360?", ["Marco 'aprovado pelo cliente' e pronto", "Registro a resposta com data, quem aprovou e o print/texto da mensagem", "Espero a coordenação registrar"], 1, "Aprovação só com evidência. Você mesma registra, com a prova anexada."),
  ("A IA gerou a ata e extraiu 3 decisões. Elas já valem como registro?", ["Sim, assim que a ata é gerada", "Não: ficam como 'confirmar' até você confirmar cada uma", "Só se a coordenação aprovar"], 1, "Itens extraídos são sugestões com trecho de origem; viram registro quando confirmados."),
  ("Quem vê o seu compromisso particular na Google Agenda?", ["Toda a equipe", "Ninguém: aparece só como 'ocupado'", "A coordenação"], 1, "Eventos privados são protegidos; o A360 mostra apenas que o horário está ocupado."),
 ],
)

# -------------------------------------------------------------------- COORDENAÇÃO
COORD = dict(
 perfil="coordenacao", titulo="Treinamento A360 — Coordenação", cab="Para a coordenação",
 intro="Esta página é para quem distribui o trabalho e acompanha a equipe. Além de tudo que a arquiteta usa, você tem o Painel operacional, Capacidade e fluxo, Alertas (com tratamento), Pessoas e a revisão interna dos entregáveis.",
 secoes=[
  ("painel", "Painel de Gestão (operacional)", "Carteira, prazos e gargalos da equipe", """
<p>Abre ao entrar. É a visão da equipe: tarefas por situação de prazo, volume por pessoa (informação de carga, não comparação), gargalos por etapa com o nome original do Vobi, projetos críticos, divergências e entregáveis.</p>
""" + fig("coord-painel", "Painel operacional da coordenação.", alta=True) + lista([
 'Cada número é clicável e abre a lista de tarefas correspondente.',
 'Janela 7 / 14 / 30 dias no topo.',
 'Bloco <b>Divergências e limitações</b>: alertas abertos, críticos, flags de limitação de dados.',
 'Bloco <b>Entregáveis e aprovações</b>: o que aguarda revisão interna (sua), o que aguarda o cliente, ajustes pedidos.']) + regra("Volume de tarefas por pessoa não considera complexidade nem dependências: é distribuição, não desempenho. Nunca use como ranking.", nao=False, rot="princípio")),
  ("capacidade", "Capacidade e fluxo", "Ferramenta da distribuição semanal", """
<p>Responde a três perguntas: quem está com o quê, o que vence em cada semana e onde o trabalho está parado. É a tela para usar na reunião de distribuição.</p>
""" + fig("coord-capacidade", "Capacidade e fluxo: carga por pessoa × próximas 6 semanas, fluxo por etapa, projetos sem responsável, entregas próximas e limitações.", alta=True) + passos([
 '<b>Carga planejada por pessoa e semana</b>: tarefas abertas com prazo em cada semana (células mais escuras = mais tarefas); atrasadas e sem prazo à parte. Clique em qualquer número para ver as tarefas.',
 '<b>Fluxo por etapa</b>: abertas, atrasadas, mediana de dias de atraso, sem responsável, sem prazo, projetos e pessoas por etapa — mostra o gargalo.',
 '<b>Projetos ativos sem ninguém respondendo</b>: projetos com tarefa aberta e nenhum responsável no Vobi. Distribua no Vobi.',
 '<b>Entregas próximas</b>: tarefas das etapas de entrega, atrasadas e por semana, com projeto e responsável.',
 '<b>Limitações desta leitura</b>: cobertura de horas estimadas, tarefas sem prazo/sem responsável, nomes do Vobi sem e-mail. Ausência de dado nunca é conformidade.']) + regra("Redistribuição é feita no Vobi (responsável e prazo da tarefa). O A360 mostra; amanhã reflete.")),
  ("alertas", "Alertas e divergências", "A IA identifica, a gestão decide", """
<p>O A360 cruza reuniões, decisões e aprovações (A360) com tarefas, revisões e refações (Vobi) e aponta possíveis divergências — por exemplo, refação depois de uma aprovação do cliente, encaminhamento vencido, decisão sem tarefa aberta. Cada alerta traz as evidências com data e trecho.</p>
""" + fig("coord-alertas", "Central de alertas: indicadores, filtros por situação/prioridade e flags de limitação de dados.", alta=True) + fig("coord-alerta", "Detalhe de um alerta: classificação, prioridade, evidências A360 × Vobi e o tratamento com histórico.", alta=True) + passos([
 'Abra o alerta e leia as evidências. Classificação: confirmada, possível, alteração aprovada, inconclusivo, corrigida, limitação.',
 '<b>Assumir análise</b> → confirmar ou descartar (com justificativa) → se confirmado, <b>correção de rota</b> com direcionamento, responsável e prazo → providências → <b>encerrar</b> com resultado.',
 'Pode <b>solicitar esclarecimento</b> ou registrar que foi uma <b>alteração aprovada</b> pelo cliente (não é divergência).',
 '<b>Flags de limitação</b>: dizem o que o A360 não consegue comparar e por quê (ex.: aprovações não vêm do Vobi). Encerram só por resolução ou aceite consciente, com justificativa.']) + regra("Alerta é indício com evidência, nunca prova nem culpa. A decisão é sua; a correção de rota é um direcionamento à produção, registrado em histórico imutável.")),
  ("entregaveis", "Entregáveis — revisão interna", "Aprovar ou pedir ajustes antes de ir ao cliente", """
<p>A arquiteta registra o entregável e a versão; você faz a revisão interna. Só depois de aprovado internamente ele pode ser marcado como enviado ao cliente.</p>
""" + fig("coord-entregavel-revisao", "Revisão interna: observações e os botões Aprovar internamente / Pedir ajustes (só coordenação, gestão e administração).", alta=True) + fig("coord-entregaveis", "Lista de entregáveis com indicadores: aguardando revisão interna, aguardando o cliente, ajustes pedidos.") + passos([
 'No Painel ou em Entregáveis, filtre <b>aguardando revisão interna</b>.',
 'Abra, veja a versão (link ou arquivo) e decida: <b>Aprovar internamente</b> ou <b>Pedir ajustes</b> (observação obrigatória).',
 'Acompanhe "enviado ao cliente" e "ajustes solicitados pelo cliente" — a resposta do cliente é registrada pela arquiteta com evidência.',
 'Cancelar um entregável exige justificativa e fica no histórico.'])),
  ("reunioes", "Reuniões e linha do tempo", "A história decisória de cada projeto", """
<p>Você vê todas as reuniões. Use a linha do tempo do projeto para reconstruir o que foi decidido e aprovado antes de uma correção de rota ou de uma conversa com o cliente.</p>
""" + fig("coord-reuniao", "Reunião com ata gerada por IA: itens com trecho de origem e nível de confiança; confirmar/descartar.", alta=True) + fig("coord-linha-do-tempo", "Linha do tempo do projeto: A360 (reuniões, decisões, aprovações, entregáveis, alertas) + Vobi (tarefas, revisões, mudanças entre cargas).", alta=True) + lista([
 'Transcrição do Meet: qualquer pessoa que vê a reunião pode enviar; a IA gera a ata; itens ficam "confirmar" até alguém confirmar.',
 'Reprocessar só quando a transcrição mudar: o A360 evita chamadas repetidas à IA e tem teto diário de custo.',
 'Encaminhamentos vencidos aparecem como alerta inconclusivo, não como cobrança.'])),
  ("pessoas", "Pessoas e Projetos", "Vínculo nome do Vobi → e-mail", """
<p>O Vobi exporta só o nome do responsável. Em <b>Pessoas</b> fica o vínculo nome → e-mail @rucelle, que define o que cada arquiteta vê no Meu Dia. Sem vínculo, a pessoa fica fora dos indicadores individuais.</p>
""" + fig("coord-pessoas", "Pessoas: nomes do Vobi com e-mail @rucelle. A hierarquia virá do People quando a integração for ativada (hoje: dado ausente).", alta=True) + fig("coord-projeto", "Página do projeto vista pela coordenação: reuniões, entregáveis, alertas e flags do projeto.", alta=True) + lista([
 'Nome novo no Vobi (pessoa nova ou grafia diferente)? Preencha o e-mail em Pessoas.',
 'Vínculo projeto × cliente ambíguo é resolvido pela coordenação em Projetos, não pelas arquitetas.',
 'Hierarquia (quem responde a quem) não é cadastrada aqui: vem do People.'])),
  ("rotina", "Rotina da coordenação", "Sugestão de uso semanal", """
<div class="grid"><div class="card"><h3>Diário (10 min)</h3>""" + lista(['Painel: atrasadas e críticos.','Entregáveis aguardando revisão interna.','Alertas novos (críticos e alta).']) + """</div>
<div class="card"><h3>Semanal — distribuição</h3>""" + lista(['Capacidade e fluxo: carga por pessoa e semana.','Projetos sem responsável → distribuir no Vobi.','Entregas próximas × combinado com clientes.']) + """</div>
<div class="card"><h3>Antes de falar com o cliente</h3>""" + lista(['Linha do tempo do projeto.','Entregáveis e aprovações registradas.','Alertas abertos do projeto.']) + """</div></div>
""" + regra("Problemas com dado (tarefa sem prazo, sem responsável, nome sem e-mail) são limitação da fonte: corrija no Vobi ou em Pessoas; não peça às arquitetas para 'alimentar o A360'.", nao=False, rot="princípio")),
 ],
 quiz=[
  ("Uma arquiteta está com 14 tarefas na próxima semana e outra com 2. O que a tela de Capacidade está dizendo?", ["Que a primeira é mais produtiva", "Que a distribuição registrada no Vobi está desigual; decida a redistribuição e aplique no Vobi", "Que a segunda está sem trabalho"], 1, "Capacidade é distribuição, não desempenho. A ação é redistribuir no Vobi."),
  ("Um alerta aponta refação depois de uma aprovação do cliente. Primeiro passo?", ["Avisar a arquiteta que errou", "Assumir a análise, ler as evidências e classificar", "Encerrar o alerta"], 1, "Alerta é indício com evidência; a análise e a decisão são suas, registradas no histórico."),
  ("Entregável chegou em 'revisão interna'. Quem aprova?", ["A arquiteta que criou", "Coordenação, gestão ou administração", "O cliente"], 1, "A revisão interna é da coordenação/gestão; a resposta do cliente é outra etapa, com evidência."),
  ("Os dados do Vobi no A360 são de quando?", ["Tempo real", "Da última sincronização automática, todo dia de manhã" if API else "Da última importação, feita todo dia de manhã pela gestão", "Da semana passada"], 1, "A data aparece no topo de cada tela."),
 ],
)

# -------------------------------------------------------------------- GERÊNCIA
GER = dict(
 perfil="gerencia", titulo="Treinamento A360 — Gerência", cab="Para a gerência",
 intro="Esta página é para quem responde pela operação de arquitetura. Além de tudo da coordenação, você tem o Painel executivo, a importação do Vobi, a qualidade dos dados, os clientes e a cobertura da integração — e acompanha a sincronização diária com o Vobi.",
 secoes=[
  ("painel", "Painel executivo", "Carteira, riscos, gargalos e decisões", """
<p>Visão da carteira inteira: projetos ativos, atrasos, concentração por pessoa, gargalos por etapa (nomes originais do Vobi), refação, projetos críticos, divergências, limitações e entregáveis. Tudo clicável até a tarefa.</p>
""" + fig("ger-painel", "Painel executivo da gestão.", alta=True) + lista([
 'Refação é contada por tarefas de revisão/refação do Vobi enquanto a cobertura de horas for baixa — a tela declara a limitação.',
 'Comparação "antes/depois do início da produção" não existe: o Vobi exportado não informa quando a produção começa (flag registrada).',
 'Use os blocos de divergências e entregáveis para a reunião semanal com a coordenação.']) + regra("Indicadores do A360 não viram nota de ninguém. A avaliação de pessoas é do People; o A360 fornece contexto operacional.", nao=False, rot="princípio")),
  ("importacao", "Sincronização com o Vobi" if API else "Importação do Vobi", "Automática, pela API, todos os dias de manhã" if API else "A rotina diária que alimenta tudo", ("""
<p>O A360 lê o Vobi pela API <b>automaticamente, todos os dias de manhã</b>. Não há exportação nem importação manual. A tela <b>Importação Vobi</b> mostra a última sincronização, a origem e o resultado; o botão <b>Sincronizar agora</b> força uma leitura fora do horário.</p>
""" + fig("ger-importacao", "Importação Vobi: última sincronização, histórico de cargas e a importação por arquivo como contingência.", alta=True) + passos([
 'Confira de manhã, no topo de qualquer tela, "dados do Vobi de hoje". Se a data estiver atrasada, abra Importação Vobi e veja o erro da última sincronização.',
 'Precisa de um dado que acabou de mudar no Vobi? <b>Sincronizar agora</b>.',
 'Se a sincronização encontrar algo anormal (muitos projetos não encontrados, por exemplo), a carga fica "aguardando conferência": abra a prévia e confirme ou rejeite.',
 'Contingência: se a API estiver fora do ar, a importação por arquivo CSV continua disponível na mesma tela (Projetos › Exportar CSV e Tarefas › Exportar CSV no Vobi).']) + regra("Só leitura: a API é usada para ler. Nada é alterado no Vobi; nada é inserido direto no banco.") + regra("Dados de clientes (CPF/CNPJ, endereço, observações) não entram; só código, nome, contato e cidade.", nao=False, rot="privacidade")) if API else ("""
<p>O A360 lê exportações do Vobi; não se atualiza sozinho. A rotina é <b>todos os dias de manhã</b>, sua ou de quem você delegar.</p>
""" + fig("ger-importacao", "Importação Vobi: última carga aceita, envio dos CSVs, prévia e histórico de cargas.", alta=True) + passos([
 'No Vobi: <b>Projetos › Ações › Exportar CSV</b> (sem filtro) e <b>Gestão de Tarefas › Tarefas › Todas as tarefas › Ações › Exportar CSV</b>. Clientes (Cadastros › Contatos › Clientes › Exportar CSV) só quando houver cliente novo.',
 'No A360, <b>Importação Vobi</b>: confira a data da <b>última carga aceita</b> no topo. Se já for a de hoje, não repita.',
 'Envie os dois arquivos, informe a data da exportação e clique em <b>Gerar prévia</b>.',
 'Confira a prévia: novos / alterados / não encontrados. Muitos "não encontrados" = exportação com filtro ou arquivo errado: não confirme.',
 'Confirme. A partir daí, todas as telas mostram "dados do Vobi de hoje".',
 'Guarde os CSVs na pasta <b>Exportações Vobi</b> do Drive. Nunca suba uma exportação antiga se houver mais nova.']) + regra("Só a interface oficial importa. Nada é alterado no Vobi; nada é inserido direto no banco.") + regra("Dados de clientes (CPF/CNPJ, endereço, observações) são descartados na leitura; só código, nome, contato e cidade entram.", nao=False, rot="privacidade"))),
  ("qualidade", "Qualidade dos dados", "O que os indicadores conseguem ou não medir", """
<p>Mostra a completude da carga: tarefas sem responsável, sem prazo, sem início, órfãs (sem projeto na origem), colisões de chave e etapas que o A360 ainda não conhece. É contexto gerencial, não lista de pendências para arquitetas.</p>
""" + fig("ger-qualidade", "Qualidade dos dados: classes de completude, projetos com mais tarefas incompletas, cobertura por arquiteta, etapas e colisões.", alta=True) + lista([
 'Tarefa <b>órfã</b> (sem projeto na exportação) fica como pendência de associação; nunca é atribuída por suposição. Corrija no Vobi.',
 '<b>Sem responsável</b> fica fora dos indicadores por pessoa; <b>sem prazo</b> fica fora de atraso e agenda.',
 'As etapas aparecem com o nome original do Vobi; o A360 não renomeia nem agrupa etapas.']) + regra("Dado incompleto na fonte é limitação, não falha de quem executa. Não transforme esta tela em cobrança.", nao=False, rot="princípio")),
  ("integracao", "Cobertura da integração e IA", "O que chega do Vobi, o que não chega, e o controle da IA", """
<p>Inventário honesto: o que o A360 recebe (projetos, tarefas, clientes, histórico entre cargas), o que consegue comparar e o que <b>não</b> recebe (apresentações, aprovações do cliente, solicitações de alteração, arquivos, produção). Cada lacuna vira uma flag com alternativa real.</p>
""" + fig("ger-integracao", "Cobertura da integração Vobi, flags gerais de limitação e o card da IA (modelo, custo, validação e consumo).", alta=True) + lista([
 '<b>IA</b>: modelo configurado, preço público, teto diário de custo, consumo acumulado e últimas chamadas. A validação real pode ser reexecutada pelo administrador.',
 'Reprocessar a mesma transcrição não chama a IA de novo (reaproveita), salvo "Reprocessar" forçado.',
 'Flags gerais só encerram por resolução (ex.: Vobi passar a exportar o dado) ou aceite consciente com justificativa.',
 'Expansão depende da Vobi (API, identificadores) — decisão D-06 no Painel Mestre.'])),
  ("capacidade", "Capacidade, entregáveis e alertas", "Mesmas ferramentas da coordenação, visão da carteira", """
<div class="grid">""" + fig("ger-capacidade", "Capacidade e fluxo: carga por pessoa e semana (toda a equipe).") + fig("ger-entregaveis", "Entregáveis: indicadores e lista; você também aprova internamente.") + fig("ger-alertas", "Alertas: tratamento, correção de rota e flags.") + """</div>
""" + lista([
 'Você aprova internamente entregáveis e trata alertas, como a coordenação; use isso para destravar quando a coordenação estiver ausente.',
 'Cancelamento de entregável e aceite de flags são decisões de gestão: exigem justificativa e ficam no histórico.',
 'Capacidade disponível (horas contratadas, férias) não existe em nenhuma fonte: a tela mostra carga planejada, não ocupação.'])),
  ("clientes", "Clientes, Pessoas e Usuários", "Cadastros de apoio", """
<div class="grid">""" + fig("ger-clientes", "Clientes do Vobi (só leitura) com os projetos vinculados.") + """</div>
""" + lista([
 '<b>Clientes</b>: ficha do Vobi e vínculo com projetos; vínculos ambíguos são resolvidos pela coordenação.',
 '<b>Pessoas</b>: vínculo nome do Vobi → e-mail; hierarquia virá do People (integração em espera).',
 '<b>Usuários</b> (só administração): criar acesso, perfil, desativar, redefinir senha. Perfis: arquiteta, coordenação, gestão, administração — verificados no servidor em cada tela.'])),
  ("governanca", "Governança do A360", "O que não muda", """
<div class="grid">
<div class="card"><h3>Fontes oficiais</h3>""" + lista(['Vobi: projetos, tarefas, etapas, prazos, clientes (só leitura).','People: hierarquia (integração em espera; até lá, dado ausente).','Google Calendar: agenda de cada pessoa, conexão individual.','A360: reuniões, atas, entregáveis, aprovações, alertas, históricos.']) + """</div>
<div class="card"><h3>Limites</h3>""" + lista(['Sem ranking ou nota individual.','Sem cobrança automática às arquitetas.','Aprovação do cliente nunca presumida.','Histórico imutável: nada é apagado, só acrescentado.','Flags só encerram por resolução ou aceite com justificativa.']) + """</div>
<div class="card"><h3>Proteção dos dados</h3>""" + lista(['Backup diário cifrado do banco, fora do Railway, 03h, com restauração comprovada.','Senhas só como hash; troca obrigatória no primeiro acesso.','Permissões por perfil no servidor.','Chaves (Google, IA) nunca aparecem em tela, log ou relatório.']) + """</div></div>
"""),
 ],
 quiz=[
  (("A sincronização ficou 'aguardando conferência' com 300 projetos não encontrados. O que fazer?", ["Confirmar, o sistema se ajusta", "Não confirmar: ver o erro, sincronizar de novo ou avisar o Rodrigo; nada é gravado antes da confirmação", "Importar por CSV por cima"], 1, "Anomalia na leitura da API não entra sozinha: a gestão confirma ou rejeita.") if API else ("A prévia da importação mostra 300 projetos 'não encontrados'. O que fazer?", ["Confirmar, o sistema se ajusta", "Não confirmar: provavelmente a exportação veio com filtro; refazer no Vobi sem filtro", "Importar só as tarefas"], 1, "Muitos 'não encontrados' é sinal de exportação parcial. Nada é gravado antes da confirmação.")),
  ("Uma flag diz que aprovações do cliente não chegam do Vobi. Como encerrar?", ["Marcar resolvida porque as arquitetas registram no A360", "Só quando a Vobi exportar o dado (resolução) ou com aceite consciente e justificativa", "Apagar a flag"], 1, "Flags encerram por resolução ou aceite consciente; a alternativa (registrar no A360) é um contorno, não a resolução."),
  ("O Painel mostra uma arquiteta com mais refação que as outras. Isso é…", ["Nota de desempenho", "Contexto operacional: contagem de tarefas de refação no Vobi, com a cobertura declarada", "Motivo de desligamento"], 1, "O A360 descreve; a avaliação de pessoas é do People, com critérios próprios."),
  ("Quem pode aprovar internamente um entregável?", ["Só a coordenação", "Coordenação, gestão e administração", "Qualquer usuário"], 1, "Perfis de gestão aprovam; a arquiteta registra e envia."),
 ],
)

def gerar(cfg):
    nav = ['<div class="grupo">Comece aqui</div><a href="#intro">O que é o A360</a><a href="#acesso">Primeiro acesso</a><div class="grupo">Módulos</div>']
    nav += [f'<a href="#{sid}">{t}</a>' for sid, t, *_ in cfg["secoes"]]
    nav.append('<div class="grupo">Fixar</div><a href="#quiz">Teste rápido</a>')
    secs = [secao("intro", "O que é o A360 e de onde vêm os dados", "Comece aqui", COMUM_INTRO, mod=False),
            secao("acesso", "Primeiro acesso", "Entrar e definir a senha", PRIMEIRO_ACESSO, mod=True)]
    for sid, t, sub, corpo in cfg["secoes"]:
        secs.append(secao(sid, t, sub, corpo))
    secs.append(secao("quiz", "Teste rápido", "Fixar o que importa", quiz(cfg["quiz"]) + '<p style="font-size:.8rem">Respostas erradas mostram a correta. Nada é registrado; é só para você.</p>', mod=False))
    page = f"""<title>{cfg['titulo']}</title>
<meta name="claude:viewport-fit-sides" content="cover">
{'' if DENTRO else '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,500;9..144,600&display=swap">'}
<style>{CSS}</style>
<body data-perfil="{cfg['perfil']}">
<div class="shell">
<aside class="side" id="lateral">
  <div class="marca"><a href="#intro" style="text-decoration:none"><b>rucelle</b><small>Architecture 360 · Treinamento</small></a><button class="menu-btn" type="button" onclick="document.getElementById('lateral').classList.toggle('aberta')">Menu</button></div>
  <nav class="nav">{''.join(nav)}</nav>
  <div class="prog"><span>{cfg['cab']} · entendido <b>0/0</b></span><div class="bar"><i></i></div></div>
  {'<!--TRILHAS--><a class="voltar" href="/meu-dia">← Voltar ao A360</a>' if DENTRO else ''}
</aside>
<div class="conteudo"><main>
<div><div class="eyebrow">rucelle · Architecture 360 · material de treinamento · {cfg['cab'].lower()}</div><h1>{cfg['titulo'].replace('Treinamento A360 — ','A360 para ')}</h1><p class="lead">{cfg['intro']}</p>
<p style="margin-top:.5rem"><span class="pill">endereço: {URL.replace('https://','')}</span><span class="pill">{"dados do Vobi: sincronizados pela API todos os dias de manhã" if API else "dados do Vobi: todos os dias de manhã"}</span><span class="pill">Vobi somente leitura</span><span class="pill">clique nas imagens para ampliar</span></p></div>
{''.join(secs)}
<div class="rodape">As telas desta página foram capturadas no ambiente de teste do A360 com a exportação do Vobi de 08/11/2026; nomes de projetos e pessoas são os reais da operação, e os exemplos de reunião e entregável são de teste. Dúvidas de uso: coordenação e gerência. Problemas no sistema: Rodrigo.</div>
</main></div></div>
<div class="lightbox" role="dialog" aria-label="Imagem ampliada"><img alt=""></div>
<script>{JS}</script>
</body>"""
    # body tag is stripped by the skeleton? keep data attr via script fallback
    page = page.replace('<body data-perfil="%s">' % cfg['perfil'], '<div id="raiz" data-perfil="%s" hidden></div>' % cfg['perfil'])
    page = page.replace('</body>', '')
    with open(f"{OUT}/{cfg['perfil']}.html", "w") as f: f.write(page)
    print("ok", cfg['perfil'], len(page))

for c in (ARQ, COORD, GER): gerar(c)
