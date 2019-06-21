
export class TypeChecker {
	public static isString(value:any):boolean {
		return (typeof(value) == "string" || value instanceof String);
	}
	public static isNumber(value:any):boolean {
		return (typeof(value) == "number" || value instanceof Number);
	}
	public static isBoolean(value:any):boolean {
		return (typeof(value) == "boolean" || value instanceof Boolean);
	}
}