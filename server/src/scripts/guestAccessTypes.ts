import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { GuestAccess } from '../models/GuestAccess.js';
import { resolveGuestAccessTypes } from '../utils/guestAccessTypes.js';

const DEFAULT_MONGODB_URI = 'mongodb://localhost:27017/church-visitors';

type Command = 'migrate' | 'revert';

async function migrate(): Promise<void> {
  const docs = await GuestAccess.find({
    $or: [{ types: { $exists: false } }, { types: { $size: 0 } }],
  }).select('type types');

  let updated = 0;
  for (const doc of docs) {
    const types = resolveGuestAccessTypes(doc);
    if (types.length === 0) continue;
    await GuestAccess.updateOne({ _id: doc._id }, { $set: { types } });
    updated += 1;
  }

  console.log(`Acessos atualizados com lista de permissões: ${updated}`);
  console.log('Tokens, URLs e publicId não foram alterados.');
}

async function revert(): Promise<void> {
  const result = await GuestAccess.updateMany({}, { $unset: { types: 1 } });
  console.log(`Campo types removido de ${result.modifiedCount} acesso(s). O campo type legado permanece.`);
}

async function main(): Promise<void> {
  const command = (process.argv[2] as Command) || 'migrate';
  if (command !== 'migrate' && command !== 'revert') {
    console.error('Use: npm run guest-access:types -- migrate|revert');
    process.exitCode = 1;
    return;
  }

    await connectDB(process.env.MONGODB_URI || DEFAULT_MONGODB_URI);
    if (command === 'revert') await revert();
    else await migrate();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
