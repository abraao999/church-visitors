import { Router, Request, Response } from 'express';
import { Visitor, RELATIONSHIPS } from '../models/Visitor.js';
import type { IFamilyMember } from '../constants/relationships.js';

const router = Router();

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function normalizeMembers(members: unknown): IFamilyMember[] {
  if (!Array.isArray(members)) return [];

  return members
    .map((item) => {
      if (typeof item === 'string') {
        const name = item.trim();
        return name ? { name, relationship: 'outro' as const } : null;
      }

      if (item && typeof item === 'object' && 'name' in item && 'relationship' in item) {
        const name = String(item.name).trim();
        const relationship = String(item.relationship);

        if (!name || !RELATIONSHIPS.includes(relationship as (typeof RELATIONSHIPS)[number])) {
          return null;
        }

        return { name, relationship: relationship as IFamilyMember['relationship'] };
      }

      return null;
    })
    .filter((item): item is IFamilyMember => item !== null);
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const dateParam = req.query.date as string | undefined;
    const date = dateParam ? new Date(dateParam) : new Date();

    const visitors = await Visitor.find({
      visitDate: { $gte: startOfDay(date), $lte: endOfDay(date) },
    }).sort({ createdAt: -1 });

    res.json(visitors);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar visitantes' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const { familyName, members, origin, visitDate } = req.body;

    if (!familyName?.trim() || !origin?.trim()) {
      return res.status(400).json({ error: 'Nome da família e origem são obrigatórios' });
    }

    const memberList = normalizeMembers(members);

    if (memberList.length === 0) {
      return res.status(400).json({ error: 'Informe ao menos um membro da família' });
    }

    const visitor = await Visitor.create({
      familyName: familyName.trim(),
      members: memberList,
      origin: origin.trim(),
      visitDate: visitDate ? new Date(visitDate) : new Date(),
    });

    res.status(201).json(visitor);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao registrar visitante' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await Visitor.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Visitante não encontrado' });
    }
    res.json({ message: 'Visitante removido' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao remover visitante' });
  }
});

export default router;
