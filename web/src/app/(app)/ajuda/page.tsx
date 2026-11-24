import Link from "next/link";
import { exigirUsuario } from "@/lib/auth";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Perguntas frequentes — Architecture 360" };

type Q = { id: string; p: string; r: React.ReactNode };
const Passos = ({ itens }: { itens: React.ReactNode[] }) => <ol className="ml-5 list-decimal space-y-1.5">{itens.map((x, i) => <li key={i}>{x}</li>)}</ol>;

/** Perguntas frequentes (reunião de apresentação à equipe, 23/11/2026): passo a passo da Minha semana e as dúvidas levantadas. */
export default async function AjudaPage() {
  await exigirUsuario();
  const grupos: { titulo: string; qs: Q[] }[] = [
    { titulo: "Minha semana: programar o dia a dia", qs: [
      { id: "programar", p: "Como programo minha semana (programação autônoma)?", r: <>
        <Passos itens={[
          <>Abra <Link href="/agenda/semana" className="underline">Agenda de produção › Minha semana</Link>.</>,
          <>No quadro <b>Propor atividade</b>, escolha o <b>Dia</b>, o <b>Projeto</b> (dá para buscar pelo nome, cliente ou nº do Vobi) e a <b>Etapa de produção</b>.</>,
          <>Em <b>Período</b>, escolha dia inteiro, manhã, tarde ou horário. Se for horário, preencha <b>início</b> e <b>fim</b>.</>,
          <>Marque <b>entrega</b> se for o dia de entregar a etapa ao cliente. A observação é opcional.</>,
          <>Toque em <b>Salvar rascunho</b>. Repita para os outros dias da semana.</>,
          <>Revise e toque em <b>Enviar para validação</b> em cada atividade. A Thaís ou a Ana Paula aprovam ou devolvem com o motivo.</>,
          <>Se voltar como <b>devolvida</b>, toque em <b>Editar</b>, ajuste e use <b>Reenviar para validação</b>.</>,
        ]} />
        <p className="mt-2 text-[var(--muted)]">Comece só pela semana atual. Durante a semana, use <b>Iniciar</b>, <b>Concluir</b> e <b>Avisar impedimento</b> em cada atividade.</p></> },
      { id: "estruturada", p: "Minha programação é estruturada. O que eu faço?", r: <>A coordenação ou a gerência programa a sua semana, e ela já entra confirmada. Você acompanha em Minha semana, registra o andamento (iniciar, concluir) e avisa impedimento. Mudança de dia ou de etapa é pedida à coordenação.</> },
      { id: "vobi-longo", p: "No Vobi a tarefa dura 7 dias (ex.: revisão). Tenho que marcar os 7 dias?", r: <>Não. Na Agenda, uma tarefa do Vobi com vários dias aparece só com a marca de <b>início</b> e a de <b>término</b>; ela não ocupa os dias do meio. O prazo final vem do Vobi automaticamente (atualizado todo dia às 6h). Você monta no A360 só os blocos dos dias em que realmente vai trabalhar nela. Se quiser a agenda mais limpa, use <b>esconder Programação do Vobi</b>.</> },
      { id: "ausencia", p: "Como aviso uma folga ou um compromisso das 10h às 12h?", r: <>Em Minha semana, quadro <b>Pedir ausência</b>: escolha o tipo, as datas e a duração (dia inteiro, manhã, tarde ou <b>intervalo de horário</b>). O pedido só vale depois que a coordenação confirma.</> },
    ] },
    { titulo: "Acesso, Google Agenda e app", qs: [
      { id: "entrar", p: "Como entro no A360?", r: <>Na tela de entrada, toque em <b>Entrar com Google (@rucelle.com.br)</b> e escolha seu e-mail da rucelle. Não precisa de senha.</> },
      { id: "google", p: "Por que conectar a Google Agenda?", r: <>Para os seus compromissos do Google (reuniões com Meet) aparecerem no A360 e para criar reuniões com convite. Na Agenda, toque em <b>conectar minha Google Agenda</b> uma vez só. A rotina de produção fica no A360; o Google fica para as reuniões.</> },
      { id: "app", p: "Como instalo no celular ou tablet?", r: <>iPhone/iPad (Safari): <b>Compartilhar › Adicionar à Tela de Início</b>. Android (Chrome): <b>Menu do A360 › Instalar o app A360</b> ou os três pontinhos do Chrome › Instalar app.</> },
      { id: "ver-agendas", p: "Consigo ver a agenda das colegas?", r: <>Sim. Na <Link href="/agenda" className="underline">Agenda</Link>, em <b>Pessoa</b>, escolha a colega ou <b>Equipe de projetos</b>. Você vê, mas quem programa é você na sua Minha semana (ou a coordenação). A agenda da direção (Rodrigo e Flávia) não é compartilhada. Compromisso marcado como particular no Google aparece só como “ocupado”.</> },
      { id: "reuniao", p: "Como marco uma reunião com o cliente (e convido a Flávia)?", r: <>
        <Passos itens={[
          <>Vá em <Link href="/reunioes/nova" className="underline">Reuniões › Nova reunião</Link>, escolha o projeto, o motivo, o dia e o horário de início e fim: <b>é esse o tempo reservado</b> na agenda.</>,
          <>Em <b>Participantes</b>, toque nos nomes da rucelle para convidar (a Flávia está lá) e escreva o e-mail do cliente, um por linha.</>,
          <>Deixe marcado <b>criar também o compromisso na minha Google Agenda</b> e <b>enviar convites por e-mail</b>; marque <b>Google Meet</b> se for online.</>,
          <>Toque em <b>Registrar reunião</b>. O Google cria o evento na sua agenda e envia o convite por e-mail a todos, inclusive ao cliente.</>,
        ]} />
        <p className="mt-2 text-[var(--muted)]">Precisa ter conectado a sua Google Agenda antes. Depois da reunião, cole a transcrição na própria reunião para gerar a ata e exportar em Word, com ou sem papel timbrado.</p></> },
    ] },
    { titulo: "Vobi e entregáveis", qs: [
      { id: "status", p: "Onde marco uma tarefa do Vobi como concluída?", r: <>No <b>Vobi</b>. O A360 só lê o Vobi (todo dia às 6h) e mostra a mudança no dia seguinte. Marcar nos dois lugares geraria conflito.</> },
      { id: "entregaveis", p: "Quando registro um entregável?", r: <>A cada entrega: crie o entregável no projeto, registre a versão com o que mudou e os links. A revisão interna segue a ordem <b>arquiteta sênior → coordenação → gerência</b> (quem é júnior escolhe a sênior: Isys, Amanda ou Luryan); cada etapa aprova ou pede ajustes, com comentário. Já tem o material? Ponha o link ou o arquivo no próprio cadastro. Quando o cliente aprovar, registre a aprovação com a evidência. O histórico fica no projeto e protege você e a equipe.</> },
      { id: "links", p: "Posso pôr vários links numa versão?", r: <>Sim, um por linha, até 20. Dá para pôr um nome antes: <i>Planta baixa: https://drive…</i>. Na versão atual, <b>+ acrescentar links a esta versão</b> inclui links depois, sem criar versão nova. Arquivo direto: até 15 MB.</> },
      { id: "atraso", p: "Uma tarefa atrasou por causa do cliente. Onde registro o motivo?", r: <>A coordenação registra em <Link href="/atrasos" className="underline">Atrasos</Link> (ou na página do projeto, <b>justificar atraso</b>): categoria, motivo e a nova data combinada. A gerência valida ou define outra medida. A data continua sendo trocada <b>no Vobi</b>.</> },
      { id: "ja-entregue", p: "Onde vejo o que já foi entregue de um projeto?", r: <>Na página do projeto, bloco <b>Já entregue</b>: etapas concluídas, apresentações ao cliente e entregáveis aprovados, a partir do que está concluído no Vobi.</> },
    ] },
    { titulo: "Feriados, dúvidas e sugestões", qs: [
      { id: "ferias", p: "A coordenadora (ou a gerente) entrou de férias. Quem aprova o que é dela?", r: <>
        <p>Marque em <Link href="/agenda/pessoas#ausencias" className="underline">Agenda › Pessoas da agenda › Ausência e cobertura</Link>: quem fica ausente, de, até (volta) e quem responde por ela. Enquanto valer, quem cobre recebe na hora o que já estava pendente e o que chegar depois:</p>
        <ul className="mt-1 list-disc pl-5"><li>a etapa dela na revisão interna dos entregáveis (em <b>Entregáveis › Para eu revisar</b>); quem cobre a coordenação e é a gerência aprova as duas etapas com um clique;</li><li>a validação de atrasos (quando a ausente é a gerência);</li><li>a validação de propostas da agenda.</li></ul>
        <p className="mt-1">Aparece um aviso no topo do A360 para quem está cobrindo. As tarefas do Vobi e as atividades programadas no nome da pessoa ausente <b>não</b> mudam de dono: reprograme no Quadro ou troque o responsável no Vobi. Na volta, tudo retorna sozinho. Vale nos dois sentidos.</p></> },
      { id: "feriados", p: "Os feriados entram sozinhos?", r: <>Os <b>nacionais</b> de 2026 e 2027 já estão cadastrados e valem para todas. Os <b>estaduais e municipais</b> são cadastrados pela gestão em Agenda › Feriados e valem pela cidade de cada arquiteta. Recesso da empresa vale para todas.</> },
      { id: "duvidas", p: "Tenho uma dúvida ou uma sugestão. Para quem mando?", r: <>Dúvida de uso: por texto no WhatsApp, para a Thaís ou o Rodrigo. Sugestão de melhoria: por e-mail, para ficar registrada. Dúvida sobre prazo ou entrega de projeto: avise a Thaís na hora, para dar tempo de falar com o cliente.</> },
    ] },
  ];
  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow="Ajuda" title="Perguntas frequentes" subtitle="O passo a passo da Minha semana e as respostas às dúvidas da apresentação à equipe." />
      <nav aria-label="Atalhos" className="flex flex-wrap gap-1.5">{grupos.map((g) => <a key={g.titulo} href={`#${g.qs[0].id}`} className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-[0.78rem] font-semibold text-[var(--txt-2)] no-underline">{g.titulo}</a>)}</nav>
      {grupos.map((g) => (
        <section key={g.titulo} className="card flex flex-col gap-1 p-4" aria-label={g.titulo}>
          <h2 className="mb-1 font-[family-name:var(--font-display)] text-lg font-semibold">{g.titulo}</h2>
          {g.qs.map((q, i) => (
            <details key={q.id} id={q.id} open={g === grupos[0] && i === 0} className="border-t border-[#f0e8e2] py-2.5 first-of-type:border-t-0">
              <summary className="cursor-pointer text-[0.95rem] font-semibold text-[var(--vinho)]">{q.p}</summary>
              <div className="mt-2 max-w-[72ch] text-[0.9rem] leading-relaxed text-[var(--txt-2)]">{q.r}</div>
            </details>
          ))}
        </section>
      ))}
      <p className="text-xs text-[var(--muted)]">Treinamento completo por perfil: menu Ajuda › Como usar o A360.</p>
    </div>
  );
}
