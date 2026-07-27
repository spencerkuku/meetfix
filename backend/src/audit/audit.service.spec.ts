import { AuditAction } from '@prisma/client';
import { AuditService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuditService.runAuditedTransaction', () => {
  function makeService() {
    const tx = { marker: 'tx' };
    const prisma = {
      $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
    } as unknown as PrismaService;
    const service = new AuditService(prisma);
    const recordSpy = jest
      .spyOn(service, 'record')
      .mockResolvedValue(undefined as never);
    return { service, recordSpy, tx };
  }

  it('runs the mutation inside the transaction and records the audit entry with that same client', async () => {
    const { service, recordSpy, tx } = makeService();
    const mutate = jest.fn().mockResolvedValue({ id: 'booking-1' });

    const result = await service.runAuditedTransaction(mutate, {
      actorId: 'actor-1',
      action: AuditAction.BOOKING_APPROVAL,
      targetType: 'Booking',
      targetId: 'booking-1',
      detail: 'Approved',
    });

    expect(mutate).toHaveBeenCalledWith(tx);
    expect(result).toEqual({ id: 'booking-1' });
    expect(recordSpy).toHaveBeenCalledWith(
      'actor-1',
      AuditAction.BOOKING_APPROVAL,
      'Booking',
      'booking-1',
      'Approved',
      tx,
    );
  });

  it('skips the audit write when the caller passes null (no transition to record)', async () => {
    const { service, recordSpy } = makeService();
    const mutate = jest.fn().mockResolvedValue({ id: 'ticket-1' });

    const result = await service.runAuditedTransaction(mutate, null);

    expect(result).toEqual({ id: 'ticket-1' });
    expect(recordSpy).not.toHaveBeenCalled();
  });
});
