"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, variaveisConfiguradas } from "@/lib/supabase";
import { FUNCOES_PADRAO, type Funcionario } from "@/lib/tipos";
import { AvisoErro, AvisoSemVariaveis, textoDoErro } from "@/components/AvisoBanco";

// Dados do formulário de adicionar/editar. id vazio = funcionário novo.
type Formulario = {
  id: string | null;
  nome: string;
  funcao: string;
  telefone: string;
};

const FORMULARIO_VAZIO: Formulario = {
  id: null,
  nome: "",
  funcao: FUNCOES_PADRAO[0],
  telefone: "",
};

export default function TelaEquipe() {
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  const [erroFormulario, setErroFormulario] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  // id do funcionário que está pedindo confirmação para desativar
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);

  const semVariaveis = !variaveisConfiguradas();

  const carregar = useCallback(async () => {
    if (!variaveisConfiguradas()) {
      setCarregando(false);
      return;
    }
    try {
      const { data, error } = await supabase()
        .from("funcionarios")
        .select("id, nome, funcao, telefone, cpf, ativo")
        .order("nome");
      if (error) throw error;
      setFuncionarios((data ?? []) as Funcionario[]);
      setErro(null);
    } catch (e) {
      setErro(textoDoErro(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function abrirNovo() {
    setErroFormulario(null);
    setFormulario({ ...FORMULARIO_VAZIO });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function abrirEdicao(f: Funcionario) {
    setErroFormulario(null);
    setConfirmandoId(null);
    setFormulario({ id: f.id, nome: f.nome, funcao: f.funcao, telefone: f.telefone ?? "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function salvar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!formulario) return;
    const nome = formulario.nome.trim();
    const funcao = formulario.funcao.trim();
    const telefone = formulario.telefone.trim();
    if (!nome) {
      setErroFormulario("Escreva o nome do funcionário.");
      return;
    }
    if (!funcao) {
      setErroFormulario("Escolha a função.");
      return;
    }
    setSalvando(true);
    setErroFormulario(null);
    try {
      const dados = { nome, funcao, telefone: telefone || null };
      const db = supabase().from("funcionarios");
      const { error } = formulario.id
        ? await db.update(dados).eq("id", formulario.id)
        : await db.insert(dados);
      if (error) throw error;
      setFormulario(null);
      await carregar();
    } catch (e) {
      setErroFormulario(`Não foi possível salvar. ${textoDoErro(e)}`);
    } finally {
      setSalvando(false);
    }
  }

  async function mudarAtivo(f: Funcionario, ativo: boolean) {
    setOcupadoId(f.id);
    try {
      const { error } = await supabase()
        .from("funcionarios")
        .update({ ativo })
        .eq("id", f.id);
      if (error) throw error;
      setConfirmandoId(null);
      await carregar();
    } catch (e) {
      setErro(textoDoErro(e));
    } finally {
      setOcupadoId(null);
    }
  }

  const ativos = funcionarios.filter((f) => f.ativo);
  const inativos = funcionarios.filter((f) => !f.ativo);

  // A lista de funções inclui a função atual, mesmo que não seja padrão.
  const opcoesFuncao =
    formulario && formulario.funcao && !FUNCOES_PADRAO.includes(formulario.funcao)
      ? [...FUNCOES_PADRAO, formulario.funcao]
      : FUNCOES_PADRAO;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Equipe</h1>
        {!formulario && !semVariaveis && (
          <button type="button" className="botao" onClick={abrirNovo}>
            + Adicionar
          </button>
        )}
      </div>

      {semVariaveis && <AvisoSemVariaveis />}
      {erro && <AvisoErro mensagem={erro} />}

      {formulario && (
        <form onSubmit={salvar} className="cartao space-y-4" noValidate>
          <h2 className="text-lg font-semibold">
            {formulario.id ? "Editar funcionário" : "Novo funcionário"}
          </h2>
          <label className="block">
            <span className="mb-1 block font-medium">Nome</span>
            <input
              className="campo"
              value={formulario.nome}
              onChange={(e) => setFormulario({ ...formulario, nome: e.target.value })}
              autoComplete="off"
              autoFocus
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Função</span>
            <select
              className="campo"
              value={formulario.funcao}
              onChange={(e) => setFormulario({ ...formulario, funcao: e.target.value })}
            >
              {opcoesFuncao.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Telefone</span>
            <input
              className="campo"
              type="tel"
              inputMode="tel"
              placeholder="(11) 91234-5678"
              value={formulario.telefone}
              onChange={(e) => setFormulario({ ...formulario, telefone: e.target.value })}
            />
          </label>
          {erroFormulario && (
            <p className="text-red-700" role="alert">
              {erroFormulario}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              className="botao-secundario"
              onClick={() => setFormulario(null)}
              disabled={salvando}
            >
              Cancelar
            </button>
            <button type="submit" className="botao" disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      )}

      {carregando && <p className="text-neutral-600">Carregando equipe...</p>}

      {!carregando && !semVariaveis && !erro && ativos.length === 0 && (
        <p className="cartao text-neutral-600">Nenhum funcionário ativo. Toque em “+ Adicionar”.</p>
      )}

      <ul className="space-y-3">
        {ativos.map((f) => (
          <li key={f.id} className="cartao">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-lg font-semibold">{f.nome}</span>
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-medium text-neutral-700">
                {f.funcao}
              </span>
            </div>
            <p className="mt-1 text-neutral-700">
              {f.telefone ? (
                <a href={`tel:${f.telefone.replace(/[^\d+]/g, "")}`} className="underline">
                  {f.telefone}
                </a>
              ) : (
                <span className="text-neutral-500">Sem telefone</span>
              )}
            </p>

            {confirmandoId === f.id ? (
              <div className="mt-3 rounded-xl bg-red-50 p-3">
                <p className="mb-3 font-medium text-red-800">
                  Desativar {f.nome}? Ele(a) deixa de aparecer na escala, mas o histórico fica guardado.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    className="botao-secundario"
                    onClick={() => setConfirmandoId(null)}
                    disabled={ocupadoId === f.id}
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    className="botao"
                    style={{ background: "#b91c1c" }}
                    onClick={() => mudarAtivo(f, false)}
                    disabled={ocupadoId === f.id}
                  >
                    {ocupadoId === f.id ? "Desativando..." : "Desativar"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <button type="button" className="botao-secundario" onClick={() => abrirEdicao(f)}>
                  Editar
                </button>
                <button
                  type="button"
                  className="botao-secundario"
                  style={{ borderColor: "#b91c1c", color: "#b91c1c" }}
                  onClick={() => setConfirmandoId(f.id)}
                >
                  Desativar
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {inativos.length > 0 && (
        <section className="space-y-3">
          <h2 className="pt-2 text-lg font-semibold text-neutral-700">
            Desativados ({inativos.length})
          </h2>
          <ul className="space-y-3">
            {inativos.map((f) => (
              <li key={f.id} className="cartao flex items-center justify-between gap-3 opacity-80">
                <div>
                  <span className="block font-semibold">{f.nome}</span>
                  <span className="text-sm text-neutral-600">{f.funcao}</span>
                </div>
                <button
                  type="button"
                  className="botao-secundario"
                  onClick={() => mudarAtivo(f, true)}
                  disabled={ocupadoId === f.id}
                >
                  {ocupadoId === f.id ? "..." : "Reativar"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
