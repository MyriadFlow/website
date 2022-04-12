const navbtn = document.querySelector('#navbtn');
const links = document.getElementById('links');
console.log(links)
navbtn.addEventListener('click',function(){
    links.classList.toggle("h-[180px]");
});

function hide() {
    if(window.innerWidth >= 1024){
        links.classList.remove("h-[180px]");
    }
    
}
window.addEventListener('resize',hide);