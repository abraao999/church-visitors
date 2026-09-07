import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { Church } from '../models/Church.js';
import { Service } from '../models/Service.js';
import { CHURCH_TIMEZONE } from '../utils/dayRange.js';
import { combineDateAndTime, DEFAULT_DURATION_MINUTES, DEFAULT_LEAD_MINUTES } from '../utils/serviceSchedule.js';

/**
 * Migração segura para cultos recorrentes.
 *
 * Não associa registros antigos a um culto.
 * Não agrupa cultos antigos em séries por nome, data ou horário.
 * Só preenche fuso, duração padrão e horário absoluto quando o culto
 * já tinha data e horário e ainda não possui esses campos.
 *
 * Não execute automaticamente no deploy.
 */

type Command = 'check' | 'migrate';

async function diagnose() {
  const churchesWithoutTimezone = await Church.collection.countDocuments({
    $or: [{ timezone: { $exists: false } }, { timezone: '' }, { timezone: null }],
  });
  const services = await Service.collection.countDocuments({});
  const withoutDuration = await Service.collection.countDocuments({
    time: { $exists: true, $nin: [null, ''] },
    durationMinutes: { $exists: false },
  });
  const withoutStart = await Service.collection.countDocuments({
    time: { $exists: true, $nin: [null, ''] },
    scheduledStartAt: { $exists: false },
  });
  const withSeries = await Service.collection.countDocuments({
    recurrenceSeriesId: { $exists: true },
  });

  return { churchesWithoutTimezone, services, withoutDuration, withoutStart, withSeries };
}

function printDiagnostic(result: Awaited<ReturnType<typeof diagnose>>): void {
  console.log('Diagnóstico de recorrência de cultos');
  console.log(`Igrejas sem fuso: ${result.churchesWithoutTimezone}`);
  console.log(`Cultos: ${result.services}`);
  console.log(`Cultos com horário e sem duração: ${result.withoutDuration}`);
  console.log(`Cultos com horário e sem scheduledStartAt: ${result.withoutStart}`);
  console.log(`Cultos já ligados a uma série: ${result.withSeries}`);
  console.log('Registros de visitantes, orações e veículos não são alterados.');
}

async function migrate(dryRun: boolean): Promise<void> {
  const diagnostic = await diagnose();
  printDiagnostic(diagnostic);

  if (dryRun) {
    console.log('Simulação concluída. Nenhum documento foi alterado.');
    return;
  }

  const churchResult = await Church.collection.updateMany(
    { $or: [{ timezone: { $exists: false } }, { timezone: '' }, { timezone: null }] },
    { $set: { timezone: CHURCH_TIMEZONE } }
  );

  const services = await Service.find({
    time: { $exists: true, $nin: [null, ''] },
    $or: [{ durationMinutes: { $exists: false } }, { scheduledStartAt: { $exists: false } }],
  });

  let updated = 0;
  for (const service of services) {
    const church = await Church.findById(service.churchId).select('timezone');
    const timeZone = church?.timezone || CHURCH_TIMEZONE;
    const scheduledStartAt =
      service.scheduledStartAt || (service.time ? combineDateAndTime(service.date, service.time, timeZone) : undefined);
    if (!service.durationMinutes) service.durationMinutes = DEFAULT_DURATION_MINUTES;
    if (!service.activationLeadMinutes) service.activationLeadMinutes = DEFAULT_LEAD_MINUTES;
    if (scheduledStartAt) service.scheduledStartAt = scheduledStartAt;
    await service.save();
    updated += 1;
  }

  console.log(
    `Migração aplicada. Igrejas atualizadas: ${churchResult.modifiedCount}. Cultos atualizados: ${updated}.`
  );
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
    console.error(error instanceof Error ? error.message : 'Falha na migração de recorrência.');
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
