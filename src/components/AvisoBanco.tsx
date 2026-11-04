// Mensagens padrão quando o banco não está configurado ou deu erro.

export function AvisoSemVariaveis() {
  return (
    <div className="cartao border-red-200 bg-red-50 text-red-800">
      As variáveis do Supabase não foram configuradas. Na Vercel, em Settings &gt;
      Environment Variables, adicione NEXT_PUBLIC_SUPABASE_URL e
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY e faça Redeploy.
    </div>
  );
}

export function AvisoErro({ mensagem }: { mensagem: string }) {
  return (
    <div className="cartao border-red-200 bg-red-50 text-red-800" role="alert">
      Não foi possível falar com o banco de dados. Tente de novo em instantes.
      <span className="mt-1 block text-sm text-red-700">Detalhe: {mensagem}</span>
    </div>
  );
}

/** Transforma qualquer erro (do Supabase ou não) em texto legível. */
export function textoDoErro(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  return String(e);
}
