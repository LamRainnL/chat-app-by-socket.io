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
    res.sendFile(__dirname + '/index.html');
});
let db;
// Kết nối đến MongoDB
const url = "mongodb+srv://lam208:5iyQvrx4rMYPW386@cluster0.gcqyosi.mongodb.net/?retryWrites=true&w=majority";
MongoClient.connect(url)
    .then(client => {
        console.log("Connected to MongoDB");

        db = client.db('socket-chat-app');//tên database
        // Đăng ký người dùng mới
        app.post('/register', async (req, res) => {
            try {
                const { username, password } = req.body;

                // Kiểm tra xem người dùng đã tồn tại trong cơ sở dữ liệu chưa
                const userExists = await db.collection('users').findOne({ username });
                if (userExists) {
                    return res.status(400).json({ message: 'Tên đăng nhập đã tồn tại!' });
                }

                // Mã hóa mật khẩu(băm)
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
                // Kiểm tra trạng thái đăng nhập của người dùng
                if (user.isLoggedIn) {
                    return res.status(403).json({ message: 'Tài khoản đang được đăng nhập!' });
                }

                // Cập nhật trạng thái đăng nhập của người dùng
                await db.collection('users').updateOne(
                    { username: username },
                    { $set: { isLoggedIn: true } }
                );
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
// Khởi tạo danh sách người dùng đang online
var onlineUsersMap = new Map();
io.on('connection', (socket) => {
    socket.on('join-chat', (name) => {
        socket.username = name;
        // Kiểm tra xem tài khoản đã đăng nhập từ nơi khác chưa
        // console.log(`${name} đã tham gia`);
        // Thêm người dùng vào danh sách người dùng đang online cho kết nối socket hiện tại
        if (!onlineUsersMap.has(socket.id)) {
            onlineUsersMap.set(socket.id, new Set());
        }
        onlineUsersMap.get(socket.id).add(name);
        // Lấy danh sách người dùng đang online cho kết nối socket hiện tại
        const allOnlineUsers = Array.from(onlineUsersMap.values()).flatMap(users => Array.from(users));
        // Gửi danh sách người dùng đang online về cho client
        io.emit('online-users', Array.from(allOnlineUsers));
        // Gửi thông báo "user đã tham gia" đến tất cả các người dùng, kèm theo tên của người dùng
        io.emit('user-joined', `${name} đã tham gia`);
    });
    socket.on('on-chat', data => {
        //kiểm tra tin nhắn có chứa emoji k
        const containsEmoji = /[\uD800-\uDFFF]./.test(data.message);
        io.emit('user-chat', { ...data, containsEmoji });
        // console.log({data})            
    })
    socket.on('send_image', (dataimg) => {
        //console.log('Received image: ' + data.fileName);no
        io.emit('receive_image', dataimg);
    });
    //Xử lý sự kiện ngắt kết nối
    socket.on('disconnect', () => {
        const username = socket.username;
        if (username && onlineUsersMap.has(socket.id)) {
            // Nếu người dùng đã đăng nhập từ kết nối hiện tại, mới xóa khỏi danh sách
            // Loại bỏ người dùng khỏi danh sách người dùng đang online cho kết nối socket hiện tại
            onlineUsersMap.get(socket.id).delete(username);

            io.emit('user-leave', `${username} đã rời đoạn chat`);
            // Cập nhật trạng thái đăng nhập của người dùng trong MongoDB thành false
            if (db) {
                db.collection('users').updateOne(
                    { username },
                    { $set: { isLoggedIn: false } },
                    (err, result) => {
                        if (err) {
                            console.error(`Error updating user ${username} status:`, err);
                        } else {
                            console.log(`User ${username} logged out`);
                        }
                    }
                );
            } else {
                console.error('Database connection not available');
            }
        }
        // Lấy danh sách người dùng đang online cho kết nối socket hiện tại
        const allOnlineUsers = Array.from(onlineUsersMap.values()).flatMap(users => Array.from(users));
        // Gửi danh sách người dùng đang online về cho client
        io.emit('online-users', Array.from(allOnlineUsers));
    });
    // Xử lý yêu cầu để lấy danh sách người dùng đang online từ client
    socket.on('get-online-users', function () {
        // Lấy danh sách người dùng đang online cho kết nối socket hiện tại
        const allOnlineUsers = Array.from(onlineUsersMap.values()).flatMap(users => Array.from(users));
        // Gửi danh sách người dùng đang online về cho client
        socket.emit('online-users', Array.from(allOnlineUsers));
    });
});

server.listen(8000, () => {
    console.log('Server is running on port 8000');
});
