const { Socket } = require('dgram');
const express= require('express');
const app= express();

const http = require('http');
const server= http.createServer(app);
const {Server}=require('socket.io')

const io= new Server(server)

app.get('/',(req,res)=>{
    res.sendFile(__dirname+'/index.html')
})
//khởi tạo khi có người dùng
io.on('connection',(socket)=>{
    console.log('user connected')
    socket.on('on-chat',data=>{
        io.emit('user-chat', data)
        // console.log({data})            
        
    })
})
server.listen(8000,()=>{
    console.log('Listening on port 8000')
})