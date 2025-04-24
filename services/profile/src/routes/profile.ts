import { Router } from 'express';
import { ddb, TABLE } from '../dal/dynamo';
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { Profile } from '../types';
import { v4 as uuid } from 'uuid';

const router = Router();

/** GET /profile/:wallet */
router.get('/:wallet', async (req, res, next) => {
  try {
    const { Item } = await ddb.send(
      new GetCommand({ TableName: TABLE, Key: { walletAddress: req.params.wallet } })
    );
    if (!Item) return res.status(404).send('not found');
    res.json(Item);
  } catch (err) { next(err); }
});

/** POST /profile  { walletAddress } */
router.post('/', async (req, res, next) => {
  try {
    const now = new Date().toISOString();
    const profile: Profile = {
      walletAddress: req.body.walletAddress,
      streak: 0,
      xp: 0,
      createdAt: now,
      updatedAt: now,
    };
    await ddb.send(new PutCommand({ TableName: TABLE, Item: profile, ConditionExpression: 'attribute_not_exists(walletAddress)' }));
    res.status(201).json(profile);
  } catch (err) { next(err); }
});

/** PATCH /profile/:wallet { streak?, xp? } */
router.patch('/:wallet', async (req, res, next) => {
  try {
    const now = new Date().toISOString();
    const updates: Record<string, any> = { updatedAt: now };
    if (req.body.streak !== undefined) updates.streak = req.body.streak;
    if (req.body.xp !== undefined) updates.xp = req.body.xp;

    const expr = Object.keys(updates).map((k, i) => `#k${i} = :v${i}`).join(', ');
    const names = Object.keys(updates).reduce((acc, k, i) => ({ ...acc, [`#k${i}`]: k }), {});
    const vals  = Object.values(updates).reduce((acc, v, i) => ({ ...acc, [`:v${i}`]: v }), {});

    await ddb.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { walletAddress: req.params.wallet },
        UpdateExpression: `SET ${expr}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: vals,
      })
    );
    res.sendStatus(204);
  } catch (err) { next(err); }
});

export default router;
