import { Router } from "express";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE } from "../dal/dynamo";

const router = Router();

/* GET /billing/summary?wallet=…&days=30 */
router.get("/summary", async (req, res, next) => {
  try {
    const wallet = req.query.wallet as string;
    const days   = Number(req.query.days) || 30;
    if (!wallet) return res.status(400).send("wallet required");

    const since = new Date(Date.now() - days * 86_400_000).toISOString();

    const data  = await ddb.send(new QueryCommand({
      TableName: TABLE,
      IndexName: "WalletTs",              // GSI pk=wallet, sk=ts
      KeyConditionExpression: "#w = :w AND #ts >= :since",
      ExpressionAttributeNames: { "#w": "wallet", "#ts": "ts" },
      ExpressionAttributeValues: { ":w": wallet, ":since": since },
    }));

    const total = (data.Items ?? []).reduce((s, e: any) => s + e.cost, 0);
    res.json({ wallet, days, totalMicroUSD: total });
  } catch (err) { next(err); }
});

export default router;
