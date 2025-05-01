import { Router } from "express";
import { ddb, TABLE } from "../dal/dynamo";
import { UpdateCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

const router = Router();

/* PATCH /points/add  { walletAddress, amount } */
router.patch("/add", async (req, res, next) => {
  try {
    const { walletAddress, amount } = req.body;
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: { walletAddress },
      UpdateExpression: "ADD xp :a; SET updatedAt = :t",
      ExpressionAttributeValues: {
        ":a": Number(amount),
        ":t": new Date().toISOString()
      }
    }));
    res.sendStatus(204);
  } catch (err) { next(err); }
});

/* GET /points/leaderboard?limit=10 */
router.get("/leaderboard", async (req, res, next) => {
  try {
    const limit = Number(req.query.limit) || 10;
    const data = await ddb.send(new QueryCommand({
      TableName: TABLE,
      IndexName: "XpIndex",          // GSI xp desc
      KeyConditionExpression: "#xp >= :zero",
      ExpressionAttributeNames: { "#xp": "xp" },
      ExpressionAttributeValues: { ":zero": 0 },
      ScanIndexForward: false,
      Limit: limit
    }));
    res.json(data.Items);
  } catch (err) { next(err); }
});

export default router;
