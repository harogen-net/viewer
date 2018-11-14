
export class DataUtil {

	public static dataURItoBlob(dataURI:string) {
		var byteString = atob(dataURI.split(',')[1]);
		var mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0]
		var ab = new ArrayBuffer(byteString.length);
		var ia = new Uint8Array(ab);
		for (var i = 0; i < byteString.length; i++) {
			ia[i] = byteString.charCodeAt(i);
		}
		var blob = new Blob([ab], {type: mimeString});
		return blob;
	}

	public static downloadBlob(blob:any, fileName:string){
		var a = document.createElement("a");
		a.href = window.URL.createObjectURL(blob);
		a.target = '_blank';
		a.download = fileName;
		a.click();
		window.URL.revokeObjectURL(a.href);
		//document.body.removeChild(a);
	}


}