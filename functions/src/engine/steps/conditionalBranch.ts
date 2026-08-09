export interface ConditionalBranchConfig {
  condition: string; // e.g., "output.quality_score >= 0.5"
  true_label?: string;
  false_label?: string;
}

/**
 * Evaluate a conditional branch based on the previous step's output.
 * Returns { branch_taken: true/false, reason: string }
 * 
 * The executor uses this to decide whether to skip the NEXT step:
 * - If branch_taken is true: continue to next step
 * - If branch_taken is false: skip the next step
 */
export function evaluateConditionalBranch(
  config: ConditionalBranchConfig,
  previousOutput: any
): { branch_taken: boolean; reason: string; evaluated_condition: string } {
  const { condition } = config;

  try {
    // Safely evaluate the condition against the previous output
    // We support simple dot-notation comparisons
    const result = safeEvaluate(condition, previousOutput);

    return {
      branch_taken: !!result,
      reason: result
        ? config.true_label || 'Condition met — continuing'
        : config.false_label || 'Condition not met — skipping next step',
      evaluated_condition: condition,
    };
  } catch (err: any) {
    return {
      branch_taken: false,
      reason: `Condition evaluation error: ${err.message}`,
      evaluated_condition: condition,
    };
  }
}

/**
 * Safe evaluation of simple conditions against an output object.
 * Supports: output.field >= value, output.field == "string", etc.
 * Does NOT use eval() — parses the condition manually for safety.
 */
function safeEvaluate(condition: string, output: any): boolean {
  // Normalize the condition
  const trimmed = condition.trim();

  // Match patterns like: output.field >= 0.5, output.field == "value"
  const match = trimmed.match(
    /^output\.(\w+(?:\.\w+)*)\s*(>=|<=|>|<|==|!=|===|!==)\s*(.+)$/
  );

  if (!match) {
    // Try evaluating as a simple truthy check: output.field
    const fieldMatch = trimmed.match(/^output\.(\w+(?:\.\w+)*)$/);
    if (fieldMatch) {
      return !!getNestedValue(output, fieldMatch[1]);
    }
    throw new Error(`Cannot parse condition: ${condition}`);
  }

  const [, fieldPath, operator, rawValue] = match;
  const fieldValue = getNestedValue(output, fieldPath);

  // Parse the comparison value
  let compValue: any;
  const trimmedValue = rawValue.trim();
  if (trimmedValue === 'true') compValue = true;
  else if (trimmedValue === 'false') compValue = false;
  else if (trimmedValue === 'null') compValue = null;
  else if (trimmedValue.startsWith('"') && trimmedValue.endsWith('"'))
    compValue = trimmedValue.slice(1, -1);
  else if (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"))
    compValue = trimmedValue.slice(1, -1);
  else compValue = Number(trimmedValue);

  switch (operator) {
    case '>=': return fieldValue >= compValue;
    case '<=': return fieldValue <= compValue;
    case '>':  return fieldValue > compValue;
    case '<':  return fieldValue < compValue;
    case '==': return fieldValue == compValue;
    case '===': return fieldValue === compValue;
    case '!=': return fieldValue != compValue;
    case '!==': return fieldValue !== compValue;
    default: throw new Error(`Unsupported operator: ${operator}`);
  }
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => {
    return current !== null && current !== undefined ? current[key] : undefined;
  }, obj);
}
