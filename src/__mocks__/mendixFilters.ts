/* Plain-object stand-ins for the Mendix filter builders (the real ones only exist inside the Mendix client). */
type Node = Record<string, unknown>;

const binary =
    (name: string) =>
    (arg1: unknown, arg2: unknown): Node => ({ name, arg1, arg2 });
const nary =
    (name: string) =>
    (...args: unknown[]): Node => {
        if (args.length < 2) {
            throw new Error(`The "${name}" function requires at least two arguments.`);
        }
        return { name, args };
    };

export const and = nary("and");
export const or = nary("or");
export const not = (arg: unknown): Node => ({ name: "not", arg });
export const attribute = (attributeId: string): Node => ({ type: "attribute", attributeId });
export const literal = (value: unknown): Node => ({ type: "literal", value });
export const empty = (): Node => ({ type: "literal", value: undefined });
export const contains = binary("contains");
export const startsWith = binary("startsWith");
export const endsWith = binary("endsWith");
export const equals = binary("=");
export const notEqual = binary("!=");
export const greaterThan = binary(">");
export const greaterThanOrEqual = binary(">=");
export const lessThan = binary("<");
export const lessThanOrEqual = binary("<=");
export const dayEquals = binary("day:=");
export const dayNotEqual = binary("day:!=");
export const dayGreaterThan = binary("day:>");
export const dayGreaterThanOrEqual = binary("day:>=");
export const dayLessThan = binary("day:<");
export const dayLessThanOrEqual = binary("day:<=");
