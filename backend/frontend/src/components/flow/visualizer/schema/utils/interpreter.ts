/**
 * This function will take a string and a list of patterns and
 * return the pattern that matches the most
 *
 */
const interpreter = (str: string, patterns: RegExp[]): RegExp => {
  return patterns
    .map(pattern => ({
      regex: pattern,
      count: Array.from(str.matchAll(pattern)).length,
    }))
    .reduce((max, current) => (current.count > max.count ? current : max)).regex;
};

export default interpreter;
