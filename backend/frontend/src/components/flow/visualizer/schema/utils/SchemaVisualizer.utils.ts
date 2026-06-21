import type { Model, ModelConnection } from "../SchemaVisualizer.types";

import interpreter from "./interpreter";

import linterRegexSetup from "./linters";
import modelExtractors from "./models";
import fieldRegexExtractors from "./field";

export const getInfoFromSchema = (
  schema: string,
): { models: Model[]; connections: ModelConnection[] } => {
  // Step 2: Clean schema from comments
  const cleanedSchema = linterRegexSetup.reduce(
    (str, linter) => str.replace(linter, ""),
    schema,
  );

  // Step 3: Store the interpreted-preferred model regex
  const modelRegex = interpreter(cleanedSchema, modelExtractors);

  // Extract model strings
  const modelStrings = Array.from(cleanedSchema.matchAll(modelRegex)).map(
    (item) => item[0],
  );

  // Extract model names
  const modelNames = Array.from(cleanedSchema.matchAll(modelRegex)).map(
    (match) => match[1],
  );

  console.log("Model Strings:", modelStrings);

  // Step 4: Parse models with fields
  const parsedModels: Model[] = modelStrings.map((modelString, index) => {
    // Detect the best field regex for the current model string
    const fieldRegex = interpreter(modelString, fieldRegexExtractors);

    return {
      name: modelNames[index],
      fields: Array.from(modelString.matchAll(fieldRegex)).map((field) => {
        const name = field?.[1];
        const type = field?.[2];

        return {
          name,
          type,
          hasConnections: !!modelNames?.find((modelName) =>
            type.includes(modelName),
          ),
        };
      }),
    };
  });

  console.log("Parsed Models:", parsedModels);

  // Step 5: Detect relationships and connections
  const connections: ModelConnection[] = [];
  parsedModels.forEach((model) => {
    model.fields.forEach((field) => {
      // Find all potential connections (model names that are substrings of the field type)
      const potentialConnections = modelNames.filter((modelName) =>
        field?.type.includes(modelName),
      );

      if (potentialConnections.length > 0) {
        // Find the best match based on the longest matching name (most specific)
        const bestMatch = potentialConnections.reduce((longest, current) =>
          current.length > longest.length ? current : longest,
        );

        // Add the connection with the best match
        connections.push({
          target: bestMatch,
          source: model.name,
          name: field.name,
        });
      }
    });
  });

  // Return parsed models and their connections
  return {
    models: parsedModels.map((model) => ({
      ...model,
      isChild: parsedModels.some((parsedModel) =>
        parsedModel.fields.find((field) => field.type?.includes(model.name)),
      ),
    })),
    connections,
  };
};
