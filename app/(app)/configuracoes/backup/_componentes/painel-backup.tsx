"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, DatabaseBackup, Download, FileDown, HardDrive, Upload } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Botao } from "@/components/ui/botao";
import { Cartao, CartaoCabecalho, CartaoConteudo, Indicador } from "@/components/ui/cartao";
import { Campo, Entrada } from "@/components/ui/campo";
import { GradeIndicadores } from "@/components/ui/pagina";
import { Selo } from "@/components/ui/selo";
import { LinhaVazia, Tabela, Tbody, Td, Th, Thead, Tr } from "@/components/ui/tabela";
import { useToast } from "@/components/ui/toast";
import { formatarTamanho, MANTER_BACKUPS, TAMANHO_MAXIMO_RESTAURACAO } from "@/lib/servicos/configuracoes-regras";

const LIMITE_RESTAURACAO_MB = Math.round(TAMANHO_MAXIMO_RESTAURACAO / (1024 * 1024));

export type BackupSerializado = {
  nome: string;
  tamanho: number;
  modificadoEm: string; // já formatado
  tipo: "backup" | "restauracao";
};

export type ResumoBackup = {
  caminhoBanco: string;
  tamanhoBanco: number | null;
  ultimoBackupEm: string | null;
  totalBackups: number;
  geradoAutomaticamenteAgora: boolean;
};

type ResultadoRestauracao = {
  nome: string;
  tamanho: number;
  integridade: string;
  tabelasEncontradas: string[];
};

export function PainelBackup({ backups, resumo }: { backups: BackupSerializado[]; resumo: ResumoBackup }) {
  const router = useRouter();
  const toast = useToast();
  const [baixando, setBaixando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [restauracao, setRestauracao] = useState<ResultadoRestauracao | null>(null);
  const [erroRestauracao, setErroRestauracao] = useState<string | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);

  async function baixarAgora() {
    setBaixando(true);
    try {
      const resposta = await fetch("/api/backup", { cache: "no-store" });
      if (!resposta.ok) {
        const corpo = (await resposta.json().catch(() => null)) as { erro?: string } | null;
        throw new Error(corpo?.erro ?? "Não foi possível gerar o backup.");
      }
      const nome = resposta.headers.get("X-Backup-Nome") ?? "uay-market-backup.db";
      const blob = await resposta.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nome;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
      toast.sucesso(`Backup ${nome} gerado. Guarde o arquivo num pen drive ou na nuvem.`);
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
      toast.erro("Escolha um arquivo .db antes de enviar.");
      return;
    }
    // Barra aqui antes de subir: a rota também confere, mas mandar um arquivo
    // de gigabytes escolhido por engano só pra ouvir "não" é desperdício.
    if (arquivo.size > TAMANHO_MAXIMO_RESTAURACAO) {
      setRestauracao(null);
      setErroRestauracao(
        `O arquivo tem ${formatarTamanho(arquivo.size)}, acima do limite de ${LIMITE_RESTAURACAO_MB} MB. Um backup do Uay Market tem poucos MB; confira se escolheu o arquivo certo.`,
      );
      return;
    }
    setEnviando(true);
    setRestauracao(null);
    setErroRestauracao(null);
    try {
      const form = new FormData();
      form.set("arquivo", arquivo);
      const resposta = await fetch("/api/backup/restaurar", { method: "POST", body: form });
      const corpo = (await resposta.json().catch(() => null)) as
        { ok: true; dados: ResultadoRestauracao } | { ok: false; erro: string } | null;
      if (!corpo) throw new Error("Resposta inesperada do servidor.");
      if (!corpo.ok) throw new Error(corpo.erro);
      setRestauracao(corpo.dados);
      toast.sucesso("Arquivo verificado com sucesso.");
      if (arquivoRef.current) arquivoRef.current.value = "";
      router.refresh();
    } catch (e) {
      setErroRestauracao(e instanceof Error ? e.message : "Não foi possível validar o arquivo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Aviso tom="info" titulo="Onde ficam os seus dados">
        Todo o sistema (produtos, vendas, clientes, caixa) fica num único arquivo:{" "}
        <code className="rounded bg-superficie px-1 font-mono text-xs">{resumo.caminhoBanco}</code>. Um backup é uma
        cópia desse arquivo. Sempre que você abre esta página, o sistema confere se o último backup tem mais de 24 horas
        e, se tiver, gera um novo sozinho na pasta <code className="font-mono text-xs">backups/</code>. Só os{" "}
        {MANTER_BACKUPS} backups mais recentes gerados por aqui ficam guardados; os mais antigos são apagados sozinhos.
        Mesmo assim, copie o arquivo pra fora do computador (pen drive, Google Drive) de vez em quando: se o PC quebrar,
        a pasta vai junto.
      </Aviso>

      {resumo.geradoAutomaticamenteAgora ? (
        <Aviso tom="sucesso">O último backup tinha mais de 24 horas, então um novo foi gerado agora.</Aviso>
      ) : null}

      <GradeIndicadores>
        <Indicador
          rotulo="Último backup"
          valor={resumo.ultimoBackupEm ?? "Nenhum"}
          detalhe={resumo.ultimoBackupEm ? "Gerado automaticamente ou pelo botão." : "Clique em Baixar backup agora."}
          tom={resumo.ultimoBackupEm ? "neutro" : "alerta"}
          icone={<Clock className="size-4" aria-hidden />}
        />
        <Indicador
          rotulo="Backups guardados"
          valor={resumo.totalBackups}
          detalhe="Na pasta backups/ deste computador."
          icone={<DatabaseBackup className="size-4" aria-hidden />}
        />
        <Indicador
          rotulo="Tamanho do banco"
          valor={resumo.tamanhoBanco !== null ? formatarTamanho(resumo.tamanhoBanco) : "?"}
          detalhe="Arquivo prisma/dev.db em uso."
          icone={<HardDrive className="size-4" aria-hidden />}
        />
      </GradeIndicadores>

      <Cartao>
        <CartaoCabecalho
          titulo="Backups existentes"
          descricao="Os mais recentes primeiro. Baixe e guarde fora deste computador."
          acoes={
            <Botao onClick={baixarAgora} pendente={baixando}>
              <Download className="size-4" aria-hidden /> Baixar backup agora
            </Botao>
          }
        />
        <CartaoConteudo>
          <Tabela>
            <Thead>
              <Tr>
                <Th>Arquivo</Th>
                <Th>Tipo</Th>
                <Th numerico>Tamanho</Th>
                <Th>Data</Th>
                <Th className="text-right">Baixar</Th>
              </Tr>
            </Thead>
            <Tbody>
              {backups.length === 0 ? (
                <LinhaVazia colunas={5} mensagem="Nenhum backup ainda. Clique em Baixar backup agora." />
              ) : null}
              {backups.map((b) => (
                <Tr key={b.nome}>
                  <Td className="font-mono text-xs">{b.nome}</Td>
                  <Td>
                    <Selo tom={b.tipo === "backup" ? "primaria" : "info"}>
                      {b.tipo === "backup" ? "Backup" : "Enviado pra restaurar"}
                    </Selo>
                  </Td>
                  <Td numerico>{formatarTamanho(b.tamanho)}</Td>
                  <Td className="tabular">{b.modificadoEm}</Td>
                  <Td className="text-right">
                    <a
                      href={`/api/backup/${encodeURIComponent(b.nome)}`}
                      download={b.nome}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-primaria hover:underline"
                    >
                      <FileDown className="size-4" aria-hidden /> Baixar
                    </a>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Tabela>
        </CartaoConteudo>
      </Cartao>

      <Cartao>
        <CartaoCabecalho
          titulo="Restaurar um backup"
          descricao="Envie um arquivo .db pra conferir se ele está íntegro. O sistema não troca o banco sozinho."
        />
        <CartaoConteudo className="flex flex-col gap-4">
          <form onSubmit={enviarRestauracao} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Campo rotulo="Arquivo de backup (.db)" htmlFor="arquivo" className="flex-1">
              <Entrada
                id="arquivo"
                name="arquivo"
                type="file"
                accept=".db,application/vnd.sqlite3,application/x-sqlite3"
                ref={arquivoRef}
                className="py-1.5"
              />
            </Campo>
            <Botao type="submit" variante="secundaria" pendente={enviando}>
              <Upload className="size-4" aria-hidden /> Enviar e verificar
            </Botao>
          </form>

          {erroRestauracao ? (
            <Aviso tom="perigo" titulo="O arquivo não passou na verificação">
              {erroRestauracao}
            </Aviso>
          ) : null}

          {restauracao ? (
            <Aviso tom="sucesso" titulo="Arquivo íntegro e pronto pra restaurar">
              <p>
                Salvo como <code className="font-mono text-xs">backups/{restauracao.nome}</code> (
                {formatarTamanho(restauracao.tamanho)}, {restauracao.tabelasEncontradas.length} tabelas, verificação:{" "}
                {restauracao.integridade}).
              </p>
              <p className="mt-2 font-semibold">Pra colocar este backup no lugar do banco atual:</p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                <li>Feche o sistema (pare o servidor do Uay Market).</li>
                <li>
                  Substitua o arquivo <code className="font-mono text-xs">{resumo.caminhoBanco}</code> por{" "}
                  <code className="font-mono text-xs">backups/{restauracao.nome}</code> (renomeie pra dev.db).
                </li>
                <li>Abra o sistema de novo. Tudo volta a ser como estava na data do backup.</li>
              </ol>
              <p className="mt-2 text-xs">
                Não dá pra trocar com o sistema aberto porque o banco está em uso. Antes de substituir, baixe um backup
                do estado atual, por segurança.
              </p>
            </Aviso>
          ) : null}
        </CartaoConteudo>
      </Cartao>
    </div>
  );
}
