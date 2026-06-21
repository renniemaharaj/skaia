import { describe, it, expect } from "vitest";

// Assuming you have a file named `models.ts` that exports the model regex
import modelRegexExtractors from "../models";

type Case = {
  input: string;
  regex: RegExp;
};

const [modelRegex, typestructRegex, interfaceRegex, typeRegex] =
  modelRegexExtractors;

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

describe("Model Regex Extractors", () => {
  cases.forEach(({ input, regex }) => {
    it(`should scrape model definition of: ${input}`, () => {
      const match = input.match(regex);
      expect(match).toBeTruthy();
    });

    it("should not match non-model text", () => {
      const input = "This is not a model definition";
      expect(input.match(regex)).toBeNull();
    });
  });
});
