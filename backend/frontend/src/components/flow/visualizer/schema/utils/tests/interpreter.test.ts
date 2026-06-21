import { describe, it, expect } from "vitest";
import interpreter from "../interpreter";
import modelRegexExtractors from "../models";

const [modelRegex, typestructRegex, interfaceRegex, typeRegex] =
  modelRegexExtractors;

type Case = {
  input: string;
  regex: RegExp;
};

const cases: Case[] = [
  {
    input: `type Order struct {
                    id         String
                    user       User
                    userId     String
                    totalAmount Float
                    orderItems OrderItem[]
                    createdAt  DateTime
                }`,
    regex: typestructRegex,
  },
  {
    input: `model Order {
                id         String
                user       User
                userId     String
                totalAmount Float
                orderItems OrderItem[]
                createdAt  DateTime
                updatedAt  DateTime
            }`,
    regex: modelRegex,
  },
  {
    input: `export type Product = {
                id: string;
                name: string;
                description: string;
                price: number;
                stock: number;
                createdAt: Date;
                updatedAt: Date;
            }`,
    regex: typeRegex,
  },
  {
    input: `interface Order {
                id: string;
                user: User;
                userId: string;
                totalAmount: number;
                orderItems: OrderItem[];
                createdAt: Date;
                updatedAt: Date;
            }`,
    regex: interfaceRegex,
  },
];

describe("Interpreter Function", () => {
  cases.forEach(({ input, regex }) => {
    it(`should return best matching => ${regex}`, () => {
      const preferredRegex = interpreter(input, modelRegexExtractors);
      expect(preferredRegex).toBe(regex);
    });
  });
});
