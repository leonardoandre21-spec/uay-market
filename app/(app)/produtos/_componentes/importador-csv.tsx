"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileSpreadsheet, RotateCcw, Upload } from "lucide-react";
import { Aviso } from "@/components/ui/aviso";
import { Botao } from "@/components/ui/botao";
import { BotaoEnviar } from "@/components/ui/botao-enviar";
import { CaixaSelecao } from "@/components/ui/campo";
import { Cartao, CartaoCabecalho, CartaoConteudo, Indicador } from "@/components/ui/cartao";
import { FormularioAcao } from "@/components/ui/formulario-acao";
import { Selo } from "@/components/ui/selo";
import { Tabela, Tbody, Td, Th, Thead, Tr } from "@/components/ui/tabela";
import { cn } from "@/lib/utils";
import {
  CAMPOS_IMPORTACAO,
  ROTULO_CAMPO_IMPORTACAO,
  analisarCsv,
  decodificarTextoCsv,
  type AnaliseCsv,
} from "@/lib/servicos/produtos-calculos";
import { BotaoLink } from "./botao-link";
import { importarProdutosCsv } from "../actions";

const LINHAS_PREVIA = 20;
const TAMANHO_MAXIMO_BYTES = 900 * 1024;

type Resultado = {
  criados: number;
  atualizados: number;
  categoriasCriadas: number;
  promocoesRemovidas: number;
  ignoradas: number;
  total: number;
};

export function ImportadorCsv() {
  const router = useRouter();
  const entradaArquivo = useRef<HTMLInputElement>(null);
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [texto, setTexto] = useState<string | null>(null);
  const [analise, setAnalise] = useState<AnaliseCsv | null>(null);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function carregar(arquivo: File) {
    setErroArquivo(null);
    setResultado(null);
    if (!/\.(csv|txt)$/i.test(arquivo.name) && !arquivo.type.includes("csv") && !arquivo.type.startsWith("text/")) {
      setErroArquivo("Escolha um arquivo .csv. No Excel: Arquivo > Salvar como > CSV (separado por ponto e vírgula).");
      return;
    }
    if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
      setErroArquivo("Arquivo grande demais (máximo 900 KB). Divida a planilha em partes menores e importe uma por vez.");
      return;
    }
    const conteudo = decodificarTextoCsv(await arquivo.arrayBuffer());
    setNomeArquivo(arquivo.name);
    setTexto(conteudo);
    setAnalise(analisarCsv(conteudo));
  }

  function limpar() {
    setNomeArquivo(null);
    setTexto(null);
    setAnalise(null);
    setErroArquivo(null);
    setResultado(null);
    if (entradaArquivo.current) entradaArquivo.current.value = "";
  }

  if (resultado) {
    return (
      <Cartao>
        <CartaoConteudo className="flex flex-col items-center gap-4 py-10 text-center">
          <CheckCircle2 className="size-12 text-sucesso" aria-hidden />
          <div>
            <p className="text-lg font-semibold text-texto">Importação concluída</p>
            <p className="mt-1 text-sm text-texto-suave">
              {resultado.total} {resultado.total === 1 ? "linha lida" : "linhas lidas"} de {nomeArquivo}.
            </p>
          </div>
          <div className="grid w-full max-w-2xl gap-3 sm:grid-cols-4">
            <Indicador rotulo="Criados" valor={resultado.criados} tom="sucesso" />
            <Indicador rotulo="Atualizados" valor={resultado.atualizados} tom="info" />
            <Indicador rotulo="Categorias novas" valor={resultado.categoriasCriadas} />
            <Indicador rotulo="Ignoradas" valor={resultado.ignoradas} tom={resultado.ignoradas > 0 ? "alerta" : "neutro"} detalhe={resultado.ignoradas > 0 ? "linhas com erro" : undefined} />
          </div>
          {resultado.promocoesRemovidas > 0 ? (
            <Aviso tom="alerta" titulo="Promoções removidas" className="w-full max-w-2xl text-left">
              {resultado.promocoesRemovidas === 1
                ? "1 produto tinha promoção igual ou acima do preço novo da planilha. A promoção foi apagada pra o caixa não cobrar o promocional mais caro que o preço normal."
                : `${resultado.promocoesRemovidas} produtos tinham promoção igual ou acima do preço novo da planilha. As promoções foram apagadas pra o caixa não cobrar o promocional mais caro que o preço normal.`}{" "}
              Se quiser manter alguma, cadastre a promoção de novo com um valor abaixo do preço atual.
            </Aviso>
          ) : null}
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <BotaoLink href="/produtos">Ver produtos</BotaoLink>
            <Botao type="button" variante="contorno" onClick={limpar}>
              <RotateCcw className="size-4" aria-hidden />
              Importar outro arquivo
            </Botao>
          </div>
        </CartaoConteudo>
      </Cartao>
    );
  }

  const camposReconhecidos = analise ? CAMPOS_IMPORTACAO.filter((c) => analise.mapa[c] !== undefined) : [];
  const previa = analise?.linhas.slice(0, LINHAS_PREVIA) ?? [];
  const podeImportar = !!analise && !analise.erroGeral && analise.validas > 0;

  return (
    <div className="flex flex-col gap-6">
      <Cartao>
        <CartaoCabecalho
          titulo="1. Escolha o arquivo"
          descricao="Planilha salva como CSV. A primeira linha precisa ter o nome das colunas."
          acoes={
            <BotaoLink href="/produtos/exportar?modelo=1" variante="contorno" tamanho="sm" nativo>
              <FileSpreadsheet className="size-4" aria-hidden />
              Baixar modelo
            </BotaoLink>
          }
        />
        <CartaoConteudo>
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setArrastando(true);
            }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => {
              e.preventDefault();
              setArrastando(false);
              const arquivo = e.dataTransfer.files?.[0];
              if (arquivo) void carregar(arquivo);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-padrao border-2 border-dashed px-6 py-10 text-center transition-colors",
              arrastando ? "border-primaria bg-primaria-suave" : "border-borda bg-superficie-2/40 hover:bg-superficie-2",
            )}
          >
            <Upload className="size-8 text-texto-fraco" aria-hidden />
            {nomeArquivo ? (
              <>
                <p className="text-sm font-medium text-texto">{nomeArquivo}</p>
                <p className="text-xs text-texto-suave">Clique pra trocar o arquivo</p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-texto">Arraste o CSV aqui ou clique pra escolher</p>
                <p className="text-xs text-texto-suave">Separado por ponto e vírgula ou vírgula. Até 900 KB.</p>
              </>
            )}
            <input
              ref={entradaArquivo}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="sr-only"
              onChange={(e) => {
                const arquivo = e.target.files?.[0];
                if (arquivo) void carregar(arquivo);
              }}
            />
          </label>
          {erroArquivo ? (
            <Aviso tom="perigo" className="mt-4">
              {erroArquivo}
            </Aviso>
          ) : null}
          <div className="mt-4 grid gap-3 text-xs text-texto-suave sm:grid-cols-2">
            <div>
              <p className="font-medium text-texto">Colunas que o sistema entende</p>
              <p className="mt-1">
                codigo ou ean · codigo_interno · nome ou descricao · categoria · unidade (UN ou KG) · preco ou preco_venda ·
                custo ou preco_custo · estoque · estoque_minimo
              </p>
            </div>
            <div>
              <p className="font-medium text-texto">Como funciona</p>
              <p className="mt-1">
                Produto com o mesmo código (de barras ou interno) é atualizado (nome, preço, custo), não duplicado.
                Categorias que não existem são criadas. O estoque da planilha só entra em produto novo. Promoção que
                ficar igual ou acima do preço novo é apagada.
              </p>
            </div>
          </div>
        </CartaoConteudo>
      </Cartao>

      {analise ? (
        <Cartao>
          <CartaoCabecalho
            titulo="2. Confira a pré-visualização"
            descricao={
              analise.erroGeral
                ? "Corrija o arquivo e escolha de novo."
                : `Mostrando as primeiras ${Math.min(LINHAS_PREVIA, analise.total)} de ${analise.total} linhas.`
            }
            acoes={
              <Botao type="button" variante="fantasma" tamanho="sm" onClick={limpar}>
                <RotateCcw className="size-4" aria-hidden />
                Trocar arquivo
              </Botao>
            }
          />
          <CartaoConteudo className="flex flex-col gap-4">
            {analise.erroGeral ? (
              <Aviso tom="perigo" titulo="Não dá pra importar este arquivo">
                {analise.erroGeral}
                {analise.cabecalhos.length ? (
                  <p className="mt-1">Colunas encontradas: {analise.cabecalhos.map((c) => `"${c}"`).join(", ")}.</p>
                ) : null}
              </Aviso>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Indicador rotulo="Linhas" valor={analise.total} />
                  <Indicador rotulo="Prontas pra importar" valor={analise.validas} tom="sucesso" />
                  <Indicador
                    rotulo="Com erro"
                    valor={analise.comErro}
                    tom={analise.comErro > 0 ? "perigo" : "neutro"}
                    detalhe={analise.comErro > 0 ? "Serão ignoradas se você marcar a opção abaixo" : "Tudo certo"}
                  />
                </div>

                <div className="flex flex-wrap gap-1.5 text-xs">
                  <span className="mr-1 self-center text-texto-suave">Colunas reconhecidas:</span>
                  {camposReconhecidos.map((c) => (
                    <Selo key={c} tom="primaria">
                      {ROTULO_CAMPO_IMPORTACAO[c]}
                      <span className="font-normal opacity-70">← {analise.cabecalhos[analise.mapa[c]!]}</span>
                    </Selo>
                  ))}
                  {analise.colunasIgnoradas.map((c) => (
                    <Selo key={`ign-${c}`} tom="neutro" className="line-through">
                      {c}
                    </Selo>
                  ))}
                </div>
              </>
            )}

            {previa.length > 0 ? (
              <Tabela>
                <Thead>
                  <tr>
                    <Th className="w-14">Linha</Th>
                    <Th>Código</Th>
                    <Th>Nome</Th>
                    <Th>Categoria</Th>
                    <Th>Un.</Th>
                    <Th numerico>Preço</Th>
                    <Th numerico>Custo</Th>
                    <Th numerico>Estoque</Th>
                    <Th numerico>Mínimo</Th>
                    <Th>Situação</Th>
                  </tr>
                </Thead>
                <Tbody>
                  {previa.map((l) => (
                    <Tr key={l.numero} className={cn(l.erros.length > 0 && "bg-perigo-suave/40 hover:bg-perigo-suave/60")}>
                      <Td className="tabular text-texto-fraco">{l.numero}</Td>
                      <Td className="font-mono text-xs">{l.valores.codigoBarras || l.valores.codigoInterno || ""}</Td>
                      <Td className="max-w-56 truncate" title={l.valores.nome}>
                        {l.valores.nome}
                      </Td>
                      <Td className="text-texto-suave">{l.valores.categoria}</Td>
                      <Td className="text-texto-suave">{l.valores.unidade || "UN"}</Td>
                      <Td numerico>{l.valores.precoVenda}</Td>
                      <Td numerico className="text-texto-suave">
                        {l.valores.precoCusto}
                      </Td>
                      <Td numerico>{l.valores.estoque}</Td>
                      <Td numerico className="text-texto-suave">
                        {l.valores.estoqueMinimo}
                      </Td>
                      <Td>
                        {l.erros.length === 0 ? (
                          <Selo tom="sucesso">OK</Selo>
                        ) : (
                          <ul className="flex flex-col gap-0.5 text-xs text-perigo">
                            {l.erros.map((e, i) => (
                              <li key={i}>{e}</li>
                            ))}
                          </ul>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Tabela>
            ) : null}

            {analise.comErro > previa.filter((l) => l.erros.length > 0).length ? (
              <p className="text-xs text-texto-suave">
                Há mais linhas com erro além das mostradas. Linhas com problema:{" "}
                {analise.linhas
                  .filter((l) => l.erros.length > 0)
                  .slice(0, 40)
                  .map((l) => l.numero)
                  .join(", ")}
                {analise.comErro > 40 ? " e outras." : "."}
              </p>
            ) : null}
          </CartaoConteudo>
        </Cartao>
      ) : null}

      {podeImportar && texto ? (
        <Cartao>
          <CartaoCabecalho titulo="3. Confirmar" descricao="Nada é gravado até você clicar em importar." />
          <CartaoConteudo>
            <FormularioAcao
              acao={importarProdutosCsv}
              aoSucesso={(d) => {
                setResultado(d);
                router.refresh();
              }}
              className="flex flex-col gap-4"
            >
              {(_estado, pendente) => (
                <>
                  <input type="hidden" name="csv" value={texto} />
                  {analise.comErro > 0 ? (
                    <CaixaSelecao
                      name="ignorarComErro"
                      rotulo={`Importar só as ${analise.validas} linhas válidas e ignorar as ${analise.comErro} com erro`}
                      defaultChecked
                    />
                  ) : null}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-texto-suave">
                      {analise.validas} {analise.validas === 1 ? "produto será importado" : "produtos serão importados"}.
                    </p>
                    <BotaoEnviar tamanho="lg" pendente={pendente}>
                      <Upload className="size-4" aria-hidden />
                      Importar {analise.validas} {analise.validas === 1 ? "produto" : "produtos"}
                    </BotaoEnviar>
                  </div>
                </>
              )}
            </FormularioAcao>
          </CartaoConteudo>
        </Cartao>
      ) : null}
    </div>
  );
}
