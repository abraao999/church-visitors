import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import { connectDB } from '../config/db.js';
import { Church } from '../models/Church.js';
import { GuestAccess } from '../models/GuestAccess.js';
import { HolyricsSettings } from '../models/HolyricsSettings.js';
import { PortariaDevice } from '../models/PortariaDevice.js';
import { PortariaPairing } from '../models/PortariaPairing.js';
import { PrayerRequest } from '../models/PrayerRequest.js';
import { RecurrenceSeries } from '../models/RecurrenceSeries.js';
import { RetentionPolicy } from '../models/RetentionPolicy.js';
import { RetentionRun } from '../models/RetentionRun.js';
import { Service } from '../models/Service.js';
import { TeamAuditEvent } from '../models/TeamAuditEvent.js';
import { TeamInvitation } from '../models/TeamInvitation.js';
import { User } from '../models/User.js';
import { VehicleNotice } from '../models/VehicleNotice.js';
import { Visitor } from '../models/Visitor.js';
import { VisitorFollowUp } from '../models/VisitorFollowUp.js';
import { FollowUpContact } from '../models/FollowUpContact.js';
import { PublicAccessEvent } from '../models/PublicAccessEvent.js';
import { ReportDailySummary } from '../models/ReportDailySummary.js';
import { ReportExportAudit } from '../models/ReportExportAudit.js';
import { createChurchSlug, normalizeChurchName } from '../utils/church.js';

type Command = 'check' | 'migrate';

interface CollectionDiagnostic {
  name: string;
  total: number;
  withoutChurch: number;
}

const TENANT_COLLECTIONS = [
  Visitor,
  PrayerRequest,
  Service,
  HolyricsSettings,
  VehicleNotice,
  GuestAccess,
  PortariaDevice,
  PortariaPairing,
  TeamInvitation,
  TeamAuditEvent,
  RecurrenceSeries,
  RetentionPolicy,
  RetentionRun,
  VisitorFollowUp,
  FollowUpContact,
  PublicAccessEvent,
  ReportDailySummary,
  ReportExportAudit,
] as const;

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function diagnose(): Promise<{
  churches: number;
  users: number;
  usersWithoutChurch: number;
  collections: CollectionDiagnostic[];
}> {
  const collections = await Promise.all(
    TENANT_COLLECTIONS.map(async (model) => ({
      name: model.collection.collectionName,
      total: await model.collection.countDocuments({}),
      withoutChurch: await model.collection.countDocuments({ churchId: { $exists: false } }),
    }))
  );

  return {
    churches: await Church.collection.countDocuments({}),
    users: await User.collection.countDocuments({}),
    usersWithoutChurch: await User.collection.countDocuments({ churchId: { $exists: false } }),
    collections,
  };
}

function printDiagnostic(result: Awaited<ReturnType<typeof diagnose>>): void {
  console.log('Diagnóstico de isolamento por igreja');
  console.log(`Igrejas: ${result.churches}`);
  console.log(`Usuários: ${result.users} (${result.usersWithoutChurch} sem igreja)`);
  for (const collection of result.collections) {
    console.log(
      `${collection.name}: ${collection.total} documento(s), ${collection.withoutChurch} sem igreja`
    );
  }
}

async function resolveTargetChurch(
  diagnostic: Awaited<ReturnType<typeof diagnose>>,
  churchName: string,
  explicitChurchId?: string
): Promise<{ churchId?: Types.ObjectId; createChurch: boolean; churchName?: string; error?: string }> {
  if (diagnostic.users !== 1) {
    return {
      createChurch: false,
      error: 'A associação automática só é aceita quando existe exatamente um usuário proprietário.',
    };
  }

  const onlyUser = await User.findOne({}).select('churchId').lean();
  if (!onlyUser) {
    return { createChurch: false, error: 'O único usuário diagnosticado não foi localizado.' };
  }

  if (explicitChurchId) {
    if (!Types.ObjectId.isValid(explicitChurchId)) {
      return { createChurch: false, error: 'O valor de --church-id não é um ObjectId válido.' };
    }

    const church = await Church.findOne({ _id: explicitChurchId, active: true })
      .select('_id name')
      .lean();
    if (!church) {
      return { createChurch: false, error: 'A igreja informada em --church-id não existe.' };
    }

    if (diagnostic.churches !== 1) {
      return {
        createChurch: false,
        error: 'A associação automática só é aceita quando existem exatamente uma igreja e um usuário.',
      };
    }

    if (onlyUser.churchId && !onlyUser.churchId.equals(church._id)) {
      return {
        createChurch: false,
        error: 'O proprietário já está associado a outra igreja. Nenhum dado foi alterado.',
      };
    }

    return { churchId: church._id, createChurch: false, churchName: church.name };
  }

  if (diagnostic.churches === 1) {
    const church = await Church.findOne({ active: true }).select('_id name').lean();
    if (!church) {
      return { createChurch: false, error: 'A única igreja existente está desativada.' };
    }
    if (onlyUser.churchId && !onlyUser.churchId.equals(church._id)) {
      return {
        createChurch: false,
        error: 'O proprietário está associado a uma igreja diferente da igreja encontrada.',
      };
    }
    return { churchId: church._id, createChurch: false, churchName: church.name };
  }

  if (diagnostic.churches === 0) {
    if (onlyUser.churchId) {
      return {
        createChurch: false,
        error: 'O proprietário possui uma referência de igreja, mas a igreja não existe.',
      };
    }
    if (!churchName) {
      return {
        createChurch: false,
        error: 'Informe --church-name para criar a igreja do único proprietário legado.',
      };
    }
    return { createChurch: true, churchName };
  }

  return {
    createChurch: false,
    error:
      'Não é possível determinar uma igreja com segurança. Nenhum dado foi alterado. ' +
      'Revise o relatório e associe os registros manualmente após identificar sua origem.',
  };
}

async function migrate(dryRun: boolean): Promise<void> {
  const diagnostic = await diagnose();
  printDiagnostic(diagnostic);

  const holyricsDiagnostic = diagnostic.collections.find(
    (item) => item.name === HolyricsSettings.collection.collectionName
  );
  if ((holyricsDiagnostic?.withoutChurch ?? 0) > 1) {
    throw new Error(
      'Há mais de uma configuração global do Holyrics. Não é seguro escolher uma automaticamente.'
    );
  }

  const churchName = normalizeChurchName(argumentValue('--church-name'));
  const target = await resolveTargetChurch(
    diagnostic,
    churchName,
    argumentValue('--church-id')
  );

  if (target.error) throw new Error(target.error);

  console.log('');
  console.log(dryRun ? 'Simulação da migração:' : 'Aplicação da migração:');
  console.log(
    target.createChurch
      ? `Criar a igreja "${target.churchName}" e associar o único proprietário.`
      : `Usar a igreja "${target.churchName}" como destino controlado.`
  );
  for (const collection of diagnostic.collections) {
    console.log(`Associar ${collection.withoutChurch} documento(s) de ${collection.name}.`);
  }

  if (dryRun) {
    console.log('');
    console.log('Simulação concluída. Nenhum documento foi alterado.');
    return;
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      let churchId = target.churchId;
      if (target.createChurch) {
        const [church] = await Church.create(
          [
            {
              name: target.churchName,
              slug: createChurchSlug(target.churchName!),
              active: true,
            },
          ],
          { session }
        );
        churchId = church._id;
      }

      if (!churchId) throw new Error('Igreja de destino não definida.');

      await User.collection.updateMany(
        { churchId: { $exists: false } },
        { $set: { churchId, role: 'owner' } },
        { session }
      );

      for (const model of TENANT_COLLECTIONS) {
        await model.collection.updateMany(
          { churchId: { $exists: false } },
          { $set: { churchId } },
          { session }
        );
      }

      for (const model of [Visitor, PrayerRequest, Service] as const) {
        await model.collection.updateMany(
          {
            churchId,
            'createdBy.userId': { $exists: true },
            'createdBy.churchId': { $exists: false },
          },
          { $set: { 'createdBy.churchId': churchId } },
          { session }
        );
      }

      await Service.collection.updateMany(
        { churchId, 'hymns.addedBy.userId': { $exists: true } },
        { $set: { 'hymns.$[hymn].addedBy.churchId': churchId } },
        {
          session,
          arrayFilters: [
            {
              'hymn.addedBy.userId': { $exists: true },
              'hymn.addedBy.churchId': { $exists: false },
            },
          ],
        }
      );
    });
  } finally {
    await session.endSession();
  }

  console.log('Migração concluída. Execute npm run tenancy:check para confirmar o resultado.');
}

async function main(): Promise<void> {
  const command = process.argv[2] as Command | undefined;
  if (command !== 'check' && command !== 'migrate') {
    throw new Error('Use o comando check ou migrate.');
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI não configurada.');
  await connectDB(uri);

  if (command === 'check') {
    printDiagnostic(await diagnose());
    return;
  }

  const dryRun = process.argv.includes('--dry-run');
  const apply = process.argv.includes('--apply');
  if (dryRun === apply) {
    throw new Error('Informe exatamente uma opção: --dry-run ou --apply.');
  }
  await migrate(dryRun);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Falha no diagnóstico multi-tenant.');
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
