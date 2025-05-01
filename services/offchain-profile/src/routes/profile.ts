import { Router } from "express";
import { ddb, TABLE } from "../dal/dynamo";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { Profile } from "../types";

const router = Router();

/* GET /profile/:wallet */
router.get("/:wallet", async (req, res, next) => {
  try {
    const { Item } = await ddb.send(new GetCommand({
      TableName: TABLE,
      Key: { walletAddress: req.params.wallet }
    }));
    if (!Item) return res.status(404).send("not found");
    res.json(Item);
  } catch (err) { next(err); }
});

/* POST /profile { walletAddress } */
router.post("/", async (req, res, next) => {
  try {
    const now = new Date().toISOString();
    const prof: Profile = {
      walletAddress: req.body.walletAddress,
      xp: 0,
      streak: 0,
      createdAt: now,
      updatedAt: now
    };
    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: prof,
      ConditionExpression: "attribute_not_exists(walletAddress)"
    }));
    res.status(201).json(prof);
  } catch (err) { next(err); }
});

export default router;
