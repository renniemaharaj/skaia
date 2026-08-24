const INPUT_TEXT_PREFIX = "__skaia_input_text__:";

export const INPUT_TEXT_OPTION = "__skaia_input_text_option__";

export function inputTextBinding(value: string): string {
  return `${INPUT_TEXT_PREFIX}${value}`;
}

export function isInputTextBinding(value: string | undefined): boolean {
  return value?.startsWith(INPUT_TEXT_PREFIX) ?? false;
}

export function inputTextValue(value: string): string {
  return isInputTextBinding(value) ? value.slice(INPUT_TEXT_PREFIX.length) : "";
}
