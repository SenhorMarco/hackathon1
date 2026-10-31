export const MAX_ARQUIVO = 5 * 1024 * 1024;
export const MAX_TOTAL = 20 * 1024 * 1024;
export const MAX_PAGINAS = 10;
export const TIPOS = ["image/jpeg", "image/png", "image/webp"] as const;
export type TipoUpload = (typeof TIPOS)[number];

export class ErroUpload extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ErroUpload";
    this.status = status;
  }
}

export function validarId(id: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new ErroUpload("Identificador inválido.");
  }
  return id;
}

export function validarArquivos(arquivos: readonly { size: number; type: string }[]) {
  if (!arquivos.length || arquivos.length > MAX_PAGINAS) {
    throw new ErroUpload(`Selecione de 1 a ${MAX_PAGINAS} páginas por aluno.`);
  }
  let total = 0;
  for (const arquivo of arquivos) {
    if (!TIPOS.includes(arquivo.type as TipoUpload)) {
      throw new ErroUpload("Use imagens PNG, JPEG ou WebP. PDF não é suportado nesta etapa.");
    }
    if (arquivo.size <= 0 || arquivo.size > MAX_ARQUIVO) {
      throw new ErroUpload("Cada página deve ter conteúdo e no máximo 5 MiB.");
    }
    total += arquivo.size;
  }
  if (total > MAX_TOTAL) throw new ErroUpload("O limite por aluno é 20 MiB.");
}

export function validarConteudo(bytes: Uint8Array, tipo: string) {
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!(tipo === "image/png" && png || tipo === "image/jpeg" && jpeg || tipo === "image/webp" && webp)) {
    throw new ErroUpload("O conteúdo de uma página não corresponde ao formato informado.");
  }
}

export function sugerirAluno(nome: string | null, alunos: readonly { id: string; nome: string }[]) {
  const normalizar = (valor: string) => valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
  if (!nome?.trim()) return null;
  const encontrados = alunos.filter((aluno) => normalizar(aluno.nome) === normalizar(nome));
  return encontrados.length === 1 ? encontrados[0].id : null;
}
