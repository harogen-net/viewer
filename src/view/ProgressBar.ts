

export class ProgressBar {

  constructor(public obj: any) {
    this.obj.addClass("progress");
  }

  public destroy() {
    this.obj.remove();
    this.obj = null;
  }

  public go(percentage: number) {
    if (percentage > 1) percentage = 1;
    if (percentage < 0) percentage = 0;

    let percentageNum = Math.round(percentage * 100);
    if (percentage == 0) {
      this.obj.addClass("init");
    } else {
      this.obj.removeClass("init");
    }
    this.obj.css("width", percentageNum + "vw");

    if (percentage == 1) {
      this.obj.addClass("hide");
    } else {
      this.obj.removeClass("hide");
    }
  }

}