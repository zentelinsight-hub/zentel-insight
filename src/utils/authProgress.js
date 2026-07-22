export function createProgressState(variant = "initial", activeIndex = 0, completed = []) {
  return { variant, activeIndex, completed };
}
