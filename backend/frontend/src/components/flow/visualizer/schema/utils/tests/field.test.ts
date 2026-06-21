import { describe, it, expect } from "vitest";
import fieldRegexExtractors from "../field";

type Case = {
  input: string;
  regex: RegExp;
};

const [nameTypeRegex, nameColonTypeRegex] = fieldRegexExtractors;

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
    regex: nameTypeRegex,
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
    regex: nameTypeRegex,
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
    regex: nameColonTypeRegex,
  },
  {
    input: `export type Product = {
                id?: string;
                name?: string;
                description?: string;
                price?: number;
                stock?: number;
                createdAt?: Date;
                updatedAt?: Date;
            }`,
    regex: nameColonTypeRegex,
  },
];

describe("Field Regex Extractors", () => {
  cases.forEach(({ input, regex }) => {
    it(`${regex} should correctly scrape all fields from model: ${input}`, () => {
      const match = Array.from(input.matchAll(regex));
      expect(match).toHaveLength(7);
    });
  });
});
