"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase, variaveisConfiguradas } from "@/lib/supabase";
import type { Escala, Funcionario, Turno } from "@/lib/tipos";
import {
  DIAS_SEMANA,
  diaMes,
  diasDaSemana,
  hojeISO,
  horaCurta,
  inicioDaSemana,
  paraData,
  rotuloDia,
  somarDias,
} from "@/lib/datas";
import { AvisoErro, AvisoSemVariaveis, textoDoErro } from "@/components/AvisoBanco";

// Célula aberta para escolher quem trabalha
type CelulaAberta = { data: string; turno: Turno };

/** Chave única de uma escolha: dia + turno + funcionário */
function chave(data: string, turnoId: string, funcionarioId: string) {
  return `${data}|${turnoId}|${funcionarioId}`;
}

/** "Ana Souza" -> "Ana S." (cabe melhor na célula) */
function nomeCurto(nome: string) {
  const partes = nome.trim().split(/\s+/);
  if (partes.length === 1) return partes[0];
  return `${partes[0]} ${partes[partes.length - 1][0]}.`;
}

export default function TelaEscala() {
  const [segunda, setSegunda] = useState(() => inicioDaSemana(hojeISO()));
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [escalas, setEscalas] = useState<Escala[]>([]);
  const [carregandoBase, setCarregandoBase] = useState(true);
  const [carregandoSemana, setCarregandoSemana] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [celula, setCelula] = useState<CelulaAberta | null>(null);
  // escolhas que estão sendo salvas agora (evita toque duplo)
  const [salvando, setSalvando] = useState<Set<string>>(new Set());

  const semVariaveis = !variaveisConfiguradas();
  const dias = useMemo(() => diasDaSemana(segunda), [segunda]);
  const hoje = hojeISO();

  // Turnos e funcionários: carregados uma vez
  useEffect(() => {
    async function carregarBase() {
      if (!variaveisConfiguradas()) {
        setCarregandoBase(false);
        return;
      }
      try {
        const db = supabase();
        const [t, f] = await Promise.all([
          db.from("turnos").select("id, nome, hora_inicio, hora_fim, ordem").order("ordem"),
          db.from("funcionarios").select("id, nome, funcao, telefone, cpf, ativo").order("nome"),
        ]);
        if (t.error) throw t.error;
        if (f.error) throw f.error;
        setTurnos((t.data ?? []) as Turno[]);
        setFuncionarios((f.data ?? []) as Funcionario[]);
      } catch (e) {
        setErro(textoDoErro(e));
      } finally {
        setCarregandoBase(false);
      }
    }
    carregarBase();
  }, []);

  // Escalas da semana: recarregadas a cada troca de semana
  const carregarSemana = useCallback(async (inicio: string) => {
    if (!variaveisConfiguradas()) {
      setCarregandoSemana(false);
      return;
    }
    setCarregandoSemana(true);
    try {
      const { data, error } = await supabase()
        .from("escalas")
        .select("id, data, turno_id, funcionario_id")
        .gte("data", inicio)
        .lte("data", somarDias(inicio, 6));
      if (error) throw error;
      setEscalas((data ?? []) as Escala[]);
      setErro(null);
    } catch (e) {
      setErro(textoDoErro(e));
    } finally {
      setCarregandoSemana(false);
    }
  }, []);

  useEffect(() => {
    carregarSemana(segunda);
  }, [segunda, carregarSemana]);

  const funcionarioPorId = useMemo(() => {
    const mapa = new Map<string, Funcionario>();
    funcionarios.forEach((f) => mapa.set(f.id, f));
    return mapa;
  }, [funcionarios]);

  const escolhidos = useMemo(() => {
    const conjunto = new Set<string>();
    escalas.forEach((e) => conjunto.add(chave(e.data, e.turno_id, e.funcionario_id)));
    return conjunto;
  }, [escalas]);

  function quemTrabalha(data: string, turnoId: string): Funcionario[] {
    return escalas
      .filter((e) => e.data === data && e.turno_id === turnoId)
      .map((e) => funcionarioPorId.get(e.funcionario_id))
      .filter((f): f is Funcionario => Boolean(f))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }

  async function alternar(data: string, turnoId: string, funcionarioId: string) {
    const k = chave(data, turnoId, funcionarioId);
    if (salvando.has(k)) return;
    const estavaEscolhido = escolhidos.has(k);

    const tirar = (lista: Escala[]) =>
      lista.filter(
        (e) => !(e.data === data && e.turno_id === turnoId && e.funcionario_id === funcionarioId),
      );
    const colocar = (lista: Escala[]) => [
      ...tirar(lista),
      { id: `novo-${k}`, data, turno_id: turnoId, funcionario_id: funcionarioId },
    ];

    // Atualiza a tela na hora; se o banco falhar, desfaz só esta escolha.
    setSalvando((s) => new Set(s).add(k));
    setEscalas(estavaEscolhido ? tirar : colocar);

    try {
      const tabela = supabase().from("escalas");
      const { error } = estavaEscolhido
        ? await tabela
            .delete()
            .eq("data", data)
            .eq("turno_id", turnoId)
            .eq("funcionario_id", funcionarioId)
        : await tabela.upsert(
            { data, turno_id: turnoId, funcionario_id: funcionarioId },
            { onConflict: "data,turno_id,funcionario_id", ignoreDuplicates: true },
          );
      if (error) throw error;
    } catch (e) {
      setEscalas(estavaEscolhido ? colocar : tirar);
      setErro(`Não foi possível salvar. ${textoDoErro(e)}`);
    } finally {
      setSalvando((s) => {
        const novo = new Set(s);
        novo.delete(k);
        return novo;
      });
    }
  }

  // Na janela de escolha: ativos + quem já está escalado (mesmo desativado)
  const opcoesCelula = useMemo(() => {
    if (!celula) return [];
    return funcionarios
      .filter(
        (f) => f.ativo || escolhidos.has(chave(celula.data, celula.turno.id, f.id)),
      )
      .sort(
        (a, b) =>
          a.funcao.localeCompare(b.funcao, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR"),
      );
  }, [celula, funcionarios, escolhidos]);

  // Fecha a janela com a tecla Esc (útil no computador)
  useEffect(() => {
    if (!celula) return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") setCelula(null);
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [celula]);

  const rotuloSemana = `${diaMes(dias[0])} a ${diaMes(dias[6])}`;
  const carregando = carregandoBase || carregandoSemana;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Escala da semana</h1>

      <div className="cartao flex items-center justify-between gap-2 p-2">
        <button
          type="button"
          className="botao-secundario min-w-14 px-3 text-xl"
          onClick={() => setSegunda((s) => somarDias(s, -7))}
          aria-label="Semana anterior"
        >
          ◀
        </button>
        <div className="text-center">
          <span className="block text-sm text-neutral-600">Semana</span>
          <span className="text-lg font-bold">{rotuloSemana}</span>
        </div>
        <button
          type="button"
          className="botao-secundario min-w-14 px-3 text-xl"
          onClick={() => setSegunda((s) => somarDias(s, 7))}
          aria-label="Próxima semana"
        >
          ▶
        </button>
      </div>

      {semVariaveis && <AvisoSemVariaveis />}
      {erro && <AvisoErro mensagem={erro} />}

      {!semVariaveis && !carregandoBase && turnos.length === 0 && !erro && (
        <p className="cartao text-neutral-600">Nenhum turno cadastrado no banco.</p>
      )}

      {turnos.length > 0 && (
        <>
          <p className="text-sm text-neutral-600">
            Toque numa célula para escolher quem trabalha. Arraste para o lado para ver todos os dias.
          </p>
          <div
            className={`overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm ${
              carregando ? "opacity-60" : ""
            }`}
          >
            <table className="w-max min-w-full border-collapse text-left">
              <thead>
                <tr>
                  <th className="sticky left-0 z-[1] w-24 border-b border-r border-neutral-200 bg-white p-2 text-sm text-neutral-600">
                    Turno
                  </th>
                  {dias.map((d) => (
                    <th
                      key={d}
                      className={`min-w-[7.5rem] border-b border-neutral-200 p-2 text-center ${
                        d === hoje ? "text-white" : ""
                      }`}
                      style={d === hoje ? { background: "var(--cor-principal)" } : undefined}
                    >
                      <span className="block text-base font-bold">
                        {DIAS_SEMANA[paraData(d).getDay()]}
                      </span>
                      <span className="text-sm font-normal">{diaMes(d)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {turnos.map((t) => (
                  <tr key={t.id}>
                    <th className="sticky left-0 z-[1] w-24 border-r border-b border-neutral-200 bg-white p-2 align-top">
                      <span className="block font-bold">{t.nome}</span>
                      <span className="text-xs font-normal text-neutral-600">
                        {horaCurta(t.hora_inicio)}–{horaCurta(t.hora_fim)}
                      </span>
                    </th>
                    {dias.map((d) => {
                      const pessoas = quemTrabalha(d, t.id);
                      return (
                        <td key={d} className="border-b border-neutral-200 p-1 align-top">
                          <button
                            type="button"
                            onClick={() => setCelula({ data: d, turno: t })}
                            className="flex min-h-24 w-full flex-col items-stretch gap-1 rounded-xl border-2 border-dashed border-neutral-300 p-2 text-left active:bg-neutral-100"
                            aria-label={`${t.nome} de ${rotuloDia(d)}: ${pessoas.length} escalados`}
                          >
                            {pessoas.length === 0 ? (
                              <span className="m-auto text-sm font-semibold text-neutral-500">
                                + Escolher
                              </span>
                            ) : (
                              <>
                                <span className="text-xs font-semibold text-neutral-500">
                                  {pessoas.length} {pessoas.length === 1 ? "pessoa" : "pessoas"}
                                </span>
                                {pessoas.map((p) => (
                                  <span
                                    key={p.id}
                                    className="rounded-md bg-neutral-100 px-2 py-1 text-sm font-medium leading-tight"
                                  >
                                    {nomeCurto(p.nome)}
                                  </span>
                                ))}
                              </>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {celula && (
        <div
          className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={() => setCelula(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Quem trabalha: ${celula.turno.nome}, ${rotuloDia(celula.data)}`}
            className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-neutral-200 p-4">
              <p className="text-sm text-neutral-600">Quem trabalha</p>
              <h2 className="text-xl font-bold">
                {celula.turno.nome} · {DIAS_SEMANA[paraData(celula.data).getDay()]}{" "}
                {diaMes(celula.data)}
              </h2>
            </div>
            <ul className="flex-1 space-y-2 overflow-y-auto p-4">
              {opcoesCelula.length === 0 && (
                <li className="text-neutral-600">Nenhum funcionário ativo. Cadastre na tela Equipe.</li>
              )}
              {opcoesCelula.map((f) => {
                const k = chave(celula.data, celula.turno.id, f.id);
                const marcado = escolhidos.has(k);
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={marcado}
                      disabled={salvando.has(k)}
                      onClick={() => alternar(celula.data, celula.turno.id, f.id)}
                      className={`flex min-h-14 w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left ${
                        marcado ? "border-transparent text-white" : "border-neutral-200 bg-white"
                      }`}
                      style={marcado ? { background: "var(--cor-principal)" } : undefined}
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 text-lg font-bold ${
                          marcado ? "border-white bg-white/20" : "border-neutral-400"
                        }`}
                        aria-hidden="true"
                      >
                        {marcado ? "✓" : ""}
                      </span>
                      <span className="flex-1">
                        <span className="block text-base font-semibold">
                          {f.nome}
                          {!f.ativo && " (desativado)"}
                        </span>
                        <span className={`text-sm ${marcado ? "text-white/80" : "text-neutral-600"}`}>
                          {f.funcao}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-neutral-200 p-4">
              <button type="button" className="botao w-full" onClick={() => setCelula(null)}>
                Pronto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
