// Documentos de configuração (taxas, metas, permissões) que antes viviam em
// arquivos JSON no disco. Ficam no modelo SystemSetting, um registro por
// documento, com trilha de auditoria em AuditLog.
//
// Motivo da mudança: arquivo no disco não tem transação (duas gravações
// simultâneas se atropelam), não entra no backup do banco e já causou falha
// de permissão em produção (arquivo do root, app roda como uid 1001).
import { prisma } from "@/lib/prisma";

export const SETTING_KEYS = {
  taxas: "config.taxas",
  metas: "config.metas",
  roles: "config.roles",
} as const;

export type SettingName = keyof typeof SETTING_KEYS;

const LABELS: Record<SettingName, string> = {
  taxas: "Taxas e canais de venda",
  metas: "Metas por mês",
  roles: "Perfis e permissões",
};

// Lê o documento. Devolve `fallback` quando ainda não existe no banco.
export async function getSetting<T>(name: SettingName, fallback: T): Promise<T> {
  const row = await prisma.systemSetting.findUnique({
    where: { key: SETTING_KEYS[name] },
  });
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

// Grava o documento e registra quem alterou.
export async function saveSetting(name: SettingName, value: unknown, userName = "Sistema"): Promise<void> {
  const key = SETTING_KEYS[name];
  const serializado = JSON.stringify(value);

  const anterior = await prisma.systemSetting.findUnique({ where: { key } });
  if (anterior?.value === serializado) return; // nada mudou

  await prisma.systemSetting.upsert({
    where: { key },
    create: { key, value: serializado, type: "json", group: "config", label: LABELS[name] },
    update: { value: serializado },
  });

  await prisma.auditLog.create({
    data: {
      action: anterior ? "update" : "create",
      entity: "setting",
      entityId: key,
      details: JSON.stringify({ por: userName, tamanho: serializado.length }),
    },
  }).catch(() => { /* auditoria nunca derruba a gravação */ });
}
