import { Router } from "express";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE } from "../dal/dynamo";
import { UsageEvent } from "../types";
import { ingestEvents, ingestLatency } from "../metrics";

const router = Router();

router.post("/", async (req, res, next) => {
  const end = ingestLatency.startTimer();
  try {
    const ev: UsageEvent = { ...req.body, ts: new Date().toISOString() };
    await ddb.send(new PutCommand({ TableName: TABLE, Item: ev }));
    ingestEvents.inc({ service: ev.service });
    res.sendStatus(204);
  } catch (err) {
    next(err);
  } finally {
    end();
  }
});

export default router;
