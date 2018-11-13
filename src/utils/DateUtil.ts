
export class DateUtil {
	public static getDateString():string{
		var date = new Date();
		var y = date.getFullYear();
		var m = ("00" + (date.getMonth()+1)).slice(-2);
		var d = ("00" + (date.getDate())).slice(-2);
		var h = ("00" + (date.getHours())).slice(-2);
		var mi = ("00" + (date.getMinutes())).slice(-2);
		var s = ("00" + (date.getSeconds())).slice(-2);
		return "" + y + "-" + m + "-" + d + "_" + h + mi + s;
	}
}