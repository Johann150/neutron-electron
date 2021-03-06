var canvas; // main canvas for drawing
var context; // 2d drawing context
var image; // an array of former activePath's
var activePath; // object storing information on how to recreate the current drawing feature
var redoStack; // array storing former activePath's that have been undone
var penColor; // the current colour used to draw as a string (e.g. "#ffffff")
var bgColor; // the current colour used for the background as a string (e.g. "#006633")
var penWidth; // width used to draw with the pen tool
var eraseWidth; // width used to erase something
var colorchooser; // DOM element: <input type="color">
var drawing; // boolean, wether the user is drawing at the moment
var prevX; // the previous x coordinate when drawing
var prevY; // the previous y coordinate when drawing
var saved; // boolean, wether the active state has been modified since the last save
var grid; // boolean, wether the grid is visisble or not
var height; // current height of the canvas
var scrolled; // how far the page is currently scrolled
var isFullscreen;

function resize(h){
	// check that the body isn't already the right size
	if(height<h){
		height=h;
		// adjust scrollbar styling
		document.getElementById('scroll').style.height=(Math.pow(document.documentElement.clientHeight,2)/height)+"px"
	}
}

function setupHandlers(){
	document.querySelector('label[for=pen]').onclick=penClick;
	document.querySelector('label[for=erase]').onclick=eraseClick;
	document.querySelector('label[for=bg-color]').onclick=bgColorClick;
	document.querySelector('label[for=grid]').onclick=gridClick;
	document.getElementById('save-img').onclick=saveImg;
	document.getElementById('save').onclick=fileSave;
	document.getElementById('open').onclick=fileOpen;
	document.getElementById('undo').onclick=undo;
	document.getElementById('redo').onclick=redo;
	document.getElementById('stroke').oninput=strokeChange;
	document.getElementById('down').onclick=down;
	document.getElementById('fullscreen').onclick=toggleFullscreen;
	window.onscroll=repaintAll;
	// check when to stop scrolling and/or drawing
	var end=()=>{
		if(drawing){
			canvas.onmouseup();
		}else if(scrolling!=-1){
			scrollStop();
		}
	};
	document.onmouseup=canvas.ontouchcancel=end;
	document.onmouseout=(evt)=>{
		if(evt.target===window||evt.target===document.documentElement||evt.target===document){
			// don't do anything if, e.g. the user is hovering over the toolbar or scrollbar while drawing
			end();
		}
	};
	// handlers for the scrollbar
	// mouse handlers
	document.getElementById('scroll').onmousedown=scrollStart;
	document.body.onmousemove=scrollMove;
	document.body.onmouseup=scrollStop;
	document.getElementById('scroll').ontouchstart=(evt)=>{
		scrollStart(evt.touches[0]);
	};
	document.body.ontouchmove=(evt)=>{
		scrollMove(evt.touches[0]);
	};
	document.body.ontouchend=scrollStop;
	document.body.ontouchcancel=document.onmouseup;
	// handlers for the canvas
	// mouse handlers
	canvas.onmousedown=drawStart;
	canvas.onmousemove=drawMove;
	canvas.onmouseup=drawStop;
	// touch handlers
	canvas.ontouchstart=(evt)=>{
		canvas.onmousedown(evt.touches[0],true);
	};
	canvas.ontouchmove=(evt)=>{
		canvas.onmousemove(evt.touches[0]);
	};
	canvas.ontouchend=()=>{
		canvas.onmouseup();
	};
	// make sure canvas gets resized if window dimension changes
	// but never reduce the canvas size
	window.onresize=()=>{
		canvas.width=document.documentElement.clientWidth-20;// subtract scrollbar size
		canvas.height=document.documentElement.clientHeight;
		// get context
		context=canvas.getContext("2d");
		// setup context
		// this enhances line drawing so there are no sudden gaps in the line
		context.lineJoin="round";
		context.lineCap="round";
		context.lineWidth=penWidth;
		repaintAll();
	};
	window.onbeforeunload=(e)=>{
		if(saved){// everything is alright
			return undefined;
		}else{
			e.preventDefault(); // don't close!
		}
	};
}

function setup(){
	// grey-out undo and redo buttons
	document.getElementById('undo').style.filter="brightness(50%)";
	document.getElementById('redo').style.filter="brightness(50%)";
	// initialize variables
	image=[];
	activePath=null;
	redoStack=[]
	penColor="#ffffff";
	document.body.style.setProperty("--pen-color",penColor);
	bgColor="#006633";
	grid="#000000";
	document.body.style.backgroundColour=bgColor;
	penWidth=2;
	eraseWidth=50;
	document.getElementById('stroke').value=penWidth;
	drawing=false;
	isFullscreen=false;
	prevX=0;
	prevY=0;
	saved=true;
	height=document.documentElement.clientHeight;
	scrolled=0;
	colorchooser=document.createElement('input');
	colorchooser.type="color";
	// get canvas
	canvas=document.getElementById("canvas");
	// initialize canvas and context
	canvas.width=document.documentElement.clientWidth-20;// subtract scrollbar size
	canvas.height=document.documentElement.clientHeight;
	// get context
	context=canvas.getContext("2d");
	// setup context
	// this enhances line drawing so there are no sudden gaps in the line
	context.lineJoin="round";
	context.lineCap="round";
	resize(document.documentElement.clientHeight);
	context.lineWidth=penWidth;
	context.clearRect(0,0,canvas.width,canvas.height);
	// check for colorchooser support
	if(!colourInputSupport()){
		// the browser based colour chooser is not supported
		document.getElementById('chooser').style.display="none";
	}
	setupHandlers();
}

/*
only saves background colour and what was written
background images will be ignored
*/
function saveImg(){
	var Ecanvas=document.createElement('canvas');
	Ecanvas.width=canvas.width;
	Ecanvas.height=height;
	var Ectx=Ecanvas.getContext('2d');
	// repaint for png download
	for(var i=0;i<image.length;i++){
		var path=image[i];
		if(path==null) continue;
		Ectx.strokeStyle=path.color;
		Ectx.lineWidth=path.width+1;
		Ectx.globalCompositeOperation=path.gco;
		Ectx.beginPath();
		Ectx.moveTo(path.points[0].x,path.points[0].y);
		for(var j=1;j<path.points.length;j++){
			Ectx.lineTo(path.points[j].x,path.points[j].y);
		}
		Ectx.stroke();
	}
	// draw grid if switched on
	Ectx.globalCompositeOperation='destination-over';
	if(document.body.classList.contains('grid')){
		var gridSize=document.documentElement.clientHeight*parseInt(getComputedStyle(document.body).getPropertyValue('--grid-size'))/100;
		Ectx.strokeStyle=grid;
		Ectx.lineWidth=1;
		for(var y=0;y<height;y+=gridSize){
			Ectx.beginPath();
			Ectx.moveTo(0,y);
			Ectx.lineTo(canvas.width,y);
			Ectx.stroke();
		}
		for(var x=0;x<canvas.width;x+=gridSize){
			Ectx.strokeStyle=grid;
			Ectx.beginPath();
			Ectx.moveTo(x,0);
			Ectx.lineTo(x,height);
			Ectx.stroke();
		}
	}
	// paint background
	Ectx.fillStyle=bgColor;
	Ectx.fillRect(0,0,Ecanvas.width,Ecanvas.height);
	// make browser download the file
	var date=new Date();
	var filename=date.getDate()+"-"+(date.getMonth()+1)+"-"+date.getFullYear()+".png";
	Ecanvas.toBlob((blob)=>{
		var url=window.URL.createObjectURL(blob);
		var anchor=document.createElement('a');
		document.body.appendChild(anchor);
		anchor.style.display="none";
		anchor.href=url;
		anchor.download=filename;
		anchor.click();
		window.URL.revokeObjectURL(url);
		anchor.remove();
	});
}

function repaintAll(){
	if(typeof canvas=='undefined'||typeof context=='undefined'){
		console.warn("canvas not defined");
		return;
	}
	// clear image
	context.clearRect(0,0,canvas.width,canvas.height);
	// paint all paths
	for(var i=0;i<image.length;i++){
		context.beginPath();
		var path=image[i];
		if(path==null){
			continue;
		}
		// set appearance
		context.strokeStyle=path.color;
		context.lineWidth=path.width+1;
		context.globalCompositeOperation=path.gco;
		// add all the points
		var moved=false;
		for(var j=0;j<path.points.length;j++){
			var point=path.points[j];
			if(
				(j>0&&pointInViewport(path.points[j-1]))// the previous point is in the viewport
				||
				pointInViewport(point)// this point is in the viewport
				||
				(j+1<path.points.length&&pointInViewport(path.points[j+1]))
					// the next point is in the viewport
					// the current point is needed for drawing the line to the next point
			){
				// this point is required
				if(!moved){
					context.moveTo(point.x,point.y-scrolled);
					moved=true;
				}
				// always make a line to also draw lines consisting of one point only
				context.lineTo(point.x,point.y-scrolled);
			}
		}
		// draw the current path
		context.stroke();
	}
}

// start neutron
setup();
