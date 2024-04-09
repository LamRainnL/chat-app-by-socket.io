const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);
const MongoClient = require('mongodb').MongoClient;
const bcrypt = require('bcrypt');

// Middleware để phân tích cú pháp dữ liệu từ form POST
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve index.html
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/html.html');
});

// Kết nối đến MongoDB
const url = "mongodb+srv://lam208:5iyQvrx4rMYPW386@cluster0.gcqyosi.mongodb.net/?retryWrites=true&w=majority";
MongoClient.connect(url)
    .then(client => {
        console.log("Connected to MongoDB");

        const db = client.db('socket-chat-app'); // Thay 'your-database-name' bằng tên cơ sở dữ liệu của bạn

        // Đăng ký người dùng mới
        app.post('/register', async (req, res) => {
            try {
                const { username, password } = req.body;

                // Kiểm tra xem người dùng đã tồn tại trong cơ sở dữ liệu chưa
                const userExists = await db.collection('users').findOne({ username });
                if (userExists) {
                    return res.status(400).json({ message: 'Tên đăng nhập đã tồn tại!' });
                }

                // Mã hóa mật khẩu
                const hashedPassword = await bcrypt.hash(password, 10);

                // Thêm người dùng mới vào cơ sở dữ liệu
                await db.collection('users').insertOne({ username, password: hashedPassword });
                res.status(200).json({ message: 'Registration successful' });
            } catch (err) {
                console.error(err);
                res.status(500).json({ message: 'An error occurred' });
            }
        });
        
        // Đăng nhập
        app.post('/login', async (req, res) => {
            try {
                const { username, password } = req.body;

                // Tìm người dùng trong cơ sở dữ liệu
                const user = await db.collection('users').findOne({ username });
                if (!user) {
                    return res.status(404).json({ message: 'User not found' });
                }

                // So sánh mật khẩu đã mã hóa
                const passwordMatch = await bcrypt.compare(password, user.password);
                if (!passwordMatch) {
                    return res.status(401).json({ message: 'Incorrect password' });
                }

                // Đăng nhập thành công
                res.status(200).json({ message: 'Login successful', username });
            } catch (err) {
                console.error(err);
                res.status(500).json({ message: 'An error occurred' });
            }
        });

    })
    .catch(err => {
        console.error("Error connecting to MongoDB:", err);
    });

//Khởi tạo khi có người dùng
io.on('connection',(socket)=>{

    socket.on('join-chat', (name) => {
        console.log(`${name} đã tham gia`);

        // Gửi thông báo "user đã tham gia" đến tất cả các người dùng, kèm theo tên của người dùng
        io.emit('user-joined', `${name} đã tham gia`);
    });
    socket.on('on-chat',data=>{
        io.emit('user-chat', data)
        // console.log({data})            
    })
})

server.listen(8000, () => {
    console.log('Server is running on port 8000');
});
