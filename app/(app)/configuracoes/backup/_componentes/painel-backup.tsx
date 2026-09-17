"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, CloudUpload, Download, LogOut, Upload } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Botao } from "@/components/ui/botao";
import { Cartao, CartaoCabecalho, CartaoConteudo, Indicador } from "@/components/ui/cartao";
import { Campo, Entrada } from "@/components/ui/campo";
import { GradeIndicadores } from "@/components/ui/pagina";
import { Tabela, Tbody, Td, Th, Thead, Tr } from "@/components/ui/tabela";
import { useToast } from "@/components/ui/toast";
import { formatarTamanho, TAMANHO_MAXIMO_RESTAURACAO } from "@/lib/servicos/configuracoes-regras";

const LIMITE_RESTAURACAO_MB = Math.round(TAMANHO_MAXIMO_RESTAURACAO / (1024 * 1024));
const PALAVRA_CONFIRMACAO = "RESTAURAR";

export type RegistroSerializado = {
  em: string; // já formatado
  usuario: string | null;
};

type RespostaRestauracao = { ok: true; contagens: Record<string, number> } | { ok: false; erro: string };

export function PainelBackup({
  tabelas,
  ultimoExportado,
  ultimaRestauracao,
}: {
  tabelas: string[];
  ultimoExportado: RegistroSerializado | null;
  ultimaRestauracao: RegistroSerializado | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [baixando, setBaixando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [confirmacao, setConfirmacao] = useState("");
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [contagens, setContagens] = useState<Record<string, number> | null>(null);
  const [erroRestauracao, setErroRestauracao] = useState<string | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);

  const podeRestaurar = confirmacao.trim() === PALAVRA_CONFIRMACAO && nomeArquivo !== null && !enviando;

  async function baixarAgora() {
    setBaixando(true);
    try {
      const resposta = await fetch("/api/backup", { cache: "no-store" });
      if (!resposta.ok) {
        const corpo = (await resposta.json().catch(() => null)) as { erro?: string } | null;
        throw new Error(corpo?.erro ?? "Não foi possível gerar o backup.");
      }
      const nome = resposta.headers.get("X-Backup-Nome") ?? "uay-market-backup.json";
      const blob = await resposta.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nome;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast.sucesso(`Backup ${nome} baixado. Guarde o arquivo no Google Drive ou num pen drive.`);
      router.refresh();
    } catch (e) {
      toast.erro(e instanceof Error ? e.message : "Não foi possível gerar o backup.");
    } finally {
      setBaixando(false);
    }
  }

  async function enviarRestauracao(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const arquivo = arquivoRef.current?.files?.[0];
    if (!arquivo) {
      toast.erro("Escolha o arquivo .json do backup antes de restaurar.");
      return;
    }
    if (confirmacao.trim() !== PALAVRA_CONFIRMACAO) {
      toast.erro(`Digite ${PALAVRA_CONFIRMACAO} pra confirmar.`);
      return;
    }
    // Barra aqui antes de subir: a rota também confere, mas mandar um arquivo
    // de gigabytes escolhido por engano só pra ouvir "não" é desperdício.
    if (arquivo.size > TAMANHO_MAXIMO_RESTAURACAO) {
      setContagens(null);
      setErroRestauracao(
        `O arquivo tem ${formatarTamanho(arquivo.size)}, acima do limite de ${LIMITE_RESTAURACAO_MB} MB. Um backup do Uay Market tem poucos MB; confira se escolheu o arquivo certo.`,
      );
      return;
    }
    setEnviando(true);
    setContagens(null);
    setErroRestauracao(null);
    try {
      const form = new FormData();
      form.set("arquivo", arquivo);
      const resposta = await fetch("/api/backup/restaurar", { method: "POST", body: form });
      const corpo = (await resposta.json().catch(() => null)) as RespostaRestauracao | null;
      if (!corpo) throw new Error("Resposta inesperada do servidor.");
      if (!corpo.ok) throw new Error(corpo.erro);
      setContagens(corpo.contagens);
      setConfirmacao("");
      setNomeArquivo(null);
      if (arquivoRef.current) arquivoRef.current.value = "";
      toast.sucesso("Backup restaurado. Saia e entre de novo no sistema.");
      router.refresh();
    } catch (e) {
      setErroRestauracao(e instanceof Error ? e.message : "Não foi possível restaurar o backup.");
    } finally {
      setEnviando(false);
    }
  }

  const totalLinhas = contagens ? Object.values(contagens).reduce((soma, n) => soma + n, 0) : 0;

  return (
    <div className="flex flex-col gap-6">
      <Aviso tom="info" titulo="Onde ficam os seus dados">
        <p>
          Em produção o banco de dados do Uay Market fica na nuvem, no Neon. O Neon guarda o histórico de tudo que
          mudou e permite voltar o banco pra qualquer minuto do passado (restauração por ponto no tempo) pelo painel
          do Neon: 24 horas de histórico no plano gratuito, mais nos planos pagos.
        </p>
        <p className="mt-2">
          Mesmo assim, baixe uma cópia toda semana pelo botão abaixo e guarde no Google Drive ou num pen drive. Se
          a conta do Neon for perdida ou o histórico não alcançar a data que você precisa, o arquivo baixado é o que
          traz o mercado de volta.
        </p>
      </Aviso>

      <GradeIndicadores>
        <Indicador
          rotulo="Último backup baixado"
          valor={ultimoExportado?.em ?? "Nenhum"}
          detalhe={
            ultimoExportado
              ? `Por ${ultimoExportado.usuario ?? "usuário removido"}.`
              : "Clique em Baixar backup agora."
          }
          tom={ultimoExportado ? "neutro" : "alerta"}
          icone={<Clock className="size-4" aria-hidden />}
        />
        <Indicador
          rotulo="Última restauração"
          valor={ultimaRestauracao?.em ?? "Nenhuma"}
          detalhe={ultimaRestauracao ? `Por ${ultimaRestauracao.usuario ?? "usuário removido"}.` : "A partir de um arquivo."}
          icone={<CloudUpload className="size-4" aria-hidden />}
        />
      </GradeIndicadores>

      <Cartao>
        <CartaoCabecalho
          titulo="Baixar backup"
          descricao="Gera um arquivo .json com todas as tabelas (produtos, vendas, clientes, caixa, financeiro, usuários). Baixe toda semana."
          acoes={
            <Botao onClick={baixarAgora} pendente={baixando}>
              <Download className="size-4" aria-hidden /> Baixar backup agora (arquivo .json)
            </Botao>
          }
        />
        <CartaoConteudo>
          <p className="text-sm text-texto-suave">
            O arquivo sai com o nome <code className="font-mono text-xs">uay-market-AAAAMMDD-HHMM.json</code>. Guarde
            fora do computador do caixa: numa pasta do Google Drive do mercado ou num pen drive que fique em outro lugar.
          </p>
        </CartaoConteudo>
      </Cartao>

      <Cartao>
        <CartaoCabecalho
          titulo="Restaurar de um arquivo"
          descricao="Coloca o sistema exatamente como estava no momento em que o arquivo foi baixado."
        />
        <CartaoConteudo className="flex flex-col gap-4">
          <p className="text-sm font-semibold text-perigo" role="alert">
            Substitui TODOS os dados atuais pelos do arquivo. Use só num sistema vazio ou pra voltar a um ponto
            anterior.
          </p>
          <p className="text-sm text-texto-suave">
            Antes de restaurar, baixe um backup do estado atual pelo botão acima, por segurança. Tudo que foi
            registrado depois da data do arquivo (vendas, entradas, fiado, boletos) deixa de existir.
          </p>

          <form onSubmit={enviarRestauracao} className="flex flex-col gap-4">
            <Campo rotulo="Arquivo de backup (.json)" htmlFor="arquivo">
              <Entrada
                id="arquivo"
                name="arquivo"
                type="file"
                accept=".json,application/json"
                ref={arquivoRef}
                className="py-1.5"
                onChange={(e) => setNomeArquivo(e.target.files?.[0]?.name ?? null)}
              />
            </Campo>
            <Campo
              rotulo={`Digite ${PALAVRA_CONFIRMACAO} pra habilitar o botão`}
              htmlFor="confirmacao"
              ajuda="Em letras maiúsculas, exatamente como está escrito."
            >
              <Entrada
                id="confirmacao"
                name="confirmacao"
                autoComplete="off"
                spellCheck={false}
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value.toUpperCase())}
                placeholder={PALAVRA_CONFIRMACAO}
                className="max-w-xs font-mono tracking-wider"
              />
            </Campo>
            <div>
              <Botao type="submit" variante="perigo" pendente={enviando} disabled={!podeRestaurar}>
                <Upload className="size-4" aria-hidden /> Restaurar e substituir todos os dados
              </Botao>
            </div>
          </form>

          {erroRestauracao ? (
            <Aviso tom="perigo" titulo="A restauração não foi feita">
              <p>{erroRestauracao}</p>
              <p className="mt-1 text-xs">Nada foi alterado: a restauração só grava quando o arquivo inteiro passa.</p>
            </Aviso>
          ) : null}

          {contagens ? (
            <div className="flex flex-col gap-4">
              <Aviso tom="alerta" titulo="Saia e entre de novo">
                <p>
                  Os dados foram substituídos ({totalLinhas.toLocaleString("pt-BR")} registros). Os usuários e PINs
                  agora são os do arquivo, então a sua sessão pode não valer mais.
                </p>
                <a href="/sair" className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold underline">
                  <LogOut className="size-4" aria-hidden /> Sair do sistema agora
                </a>
              </Aviso>
              <Tabela>
                <Thead>
                  <Tr>
                    <Th>Tabela</Th>
                    <Th numerico>Registros restaurados</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {tabelas.map((nome) => (
                    <Tr key={nome}>
                      <Td className="font-mono text-xs">{nome}</Td>
                      <Td numerico>{(contagens[nome] ?? 0).toLocaleString("pt-BR")}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Tabela>
            </div>
          ) : null}
        </CartaoConteudo>
      </Cartao>
    </div>
  );
}
