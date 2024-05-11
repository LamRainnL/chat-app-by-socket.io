const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);
const MongoClient = require('mongodb').MongoClient;
const bcrypt = require('bcrypt');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { timeStamp } = require('console');

// Middleware để phân tích cú pháp dữ liệu từ form POST
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve index.html
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Tạo thư mục tạm thời nếu chưa tồn tại
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
}

// Cấu hình lưu trữ cho Multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(tempDir, file.fieldname); // Tạo thư mục con dựa trên loại tệp
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        cb(null, uploadDir); // Thư mục lưu trữ tệp tạm thời
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname); // Tên tệp mới
    }
});

// Tạo đối tượng Multer cho hình ảnh
const uploadImage = multer({
    storage: storage,
    limits: { fileSize: 1024 * 1024 * 5 }, // Cho phép tệp tối đa 5MB
    fileFilter: function (req, file, cb) {
        // Cho phép chỉ các tệp hình ảnh
        if (file.fieldname === 'image' && file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Chỉ cho phép tải lên hình ảnh!'), false);
        }
    }
});

// Tạo đối tượng Multer cho các tệp khác
const uploadFile = multer({
    storage: storage,
    limits: { fileSize: 1024 * 1024 * 5 }, // Cho phép tệp tối đa 5MB
    fileFilter: function (req, file, cb) {
        // Cho phép chỉ các tệp .csv, .pdf, .docx
        if (file.fieldname === 'file' && (
            file.mimetype === 'text/csv' ||
            file.mimetype === 'application/pdf' ||
            file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )) {
            cb(null, true);
        } else {
            cb(new Error('Chỉ cho phép tải lên tệp .csv, .pdf, .docx!'), false);
        }
    }
});

let db;
// Kết nối đến MongoDB
const url = "mongodb+srv://lam208:5iyQvrx4rMYPW386@cluster0.gcqyosi.mongodb.net/?retryWrites=true&w=majority";
MongoClient.connect(url)
    .then(client => {
        console.log("Connected to MongoDB");

        db = client.db('socket-chat-app'); //tên database
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
    const allOnlineUsers = Array.from(onlineUsersMap.values()).flatMap(
      (users) => Array.from(users)
    );
    // Gửi danh sách người dùng đang online về cho client
    io.emit('online-users', Array.from(allOnlineUsers));
    // Gửi thông báo "user đã tham gia" đến tất cả các người dùng, kèm theo tên của người dùng
    io.emit('user-joined', `${name} đã tham gia`);
  });
  socket.on('on-chat', (data) => {
    //kiểm tra tin nhắn có chứa emoji k
    const containsEmoji = /[\uD800-\uDFFF]./.test(data.message);
    io.emit('user-chat', { ...data, containsEmoji });
    // console.log({data})
  });

  // Xử lý tải lên hình ảnh
  app.post('/upload_image', uploadImage.array('image'), (req, res) => {
    if (req.files && req.files.length > 0) {
      req.files.forEach((file) => {
        const fileName = file.originalname;
        const fileType = file.mimetype;
        const tempFilePath = file.path;

        // Tạo tên tệp duy nhất và di chuyển tệp đến thư mục tạm thời
        const uniqueFileName = `${Date.now()}-${fileName}`;
        const newFilePath = path.join(tempDir, 'image', uniqueFileName);

        // Di chuyển tệp đến thư mục tạm thời
        fs.rename(tempFilePath, newFilePath, (err) => {
          if (err) {
            console.error('Lỗi di chuyển tệp:', err);
            res.status(500).json({ message: 'Lỗi xử lý tệp' });
            return;
          }

          // Tạo URL tải xuống
          const downloadUrl = `${req.protocol}://${req.get('host')}/temp/image/${uniqueFileName}`;

          // Gửi thông tin tệp đến tất cả các client
          io.emit('receive_file', {
            timestamp: req.body.timestamp,
            fileName: fileName,
            fileType: fileType,
            downloadUrl: downloadUrl,
            name: req.body.name, 
          });
        });
      });

      res.status(200).json({ message: 'Tải lên hình ảnh thành công' });
    } else {
      res.status(400).json({ message: 'Không có tệp nào được tải lên' });
    }
  });

  // Xử lý tải lên các tệp khác
  app.post('/upload_file', uploadFile.array('file'), (req, res) => {
    if (req.files && req.files.length > 0) {
      req.files.forEach((file) => {
        const fileName = file.originalname;
        const fileType = file.mimetype;
        const tempFilePath = file.path;
        // Tạo tên tệp duy nhất và di chuyển tệp đến thư mục tạm thời
        const uniqueFileName = `${Date.now()}-${fileName}`;
        const newFilePath = path.join(tempDir, 'file', uniqueFileName);

        // Di chuyển tệp đến thư mục tạm thời
        fs.rename(tempFilePath, newFilePath, (err) => {
          if (err) {
            console.error('Lỗi di chuyển tệp:', err);
            res.status(500).json({ message: 'Lỗi xử lý tệp' });
            return;
          }

          // Tạo URL tải xuống
          const downloadUrl = `${req.protocol}://${req.get('host')}/temp/image/${uniqueFileName}`;

          // Gửi thông tin tệp đến tất cả các client
          io.emit('receive_file', {
            timestamp: req.body.timestamp, 
            fileName: fileName,
            fileType: fileType,
            downloadUrl: downloadUrl,
            name: req.body.name, 
          });
        });
      });

      res.status(200).json({ message: 'Tải lên tệp thành công' });
    } else {
      res.status(400).json({ message: 'Không có tệp nào được tải lên' });
    }
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
              console.error(
                `Error updating user ${username} status:`,
                err
              );
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
    const allOnlineUsers = Array.from(onlineUsersMap.values()).flatMap(
      (users) => Array.from(users)
    );
    // Gửi danh sách người dùng đang online về cho client
    io.emit('online-users', Array.from(allOnlineUsers));
  });
  // Xử lý sự kiện logout trên từng socket
  socket.on('logout', () => {
    const username = socket.username;
    if (username && onlineUsersMap.has(socket.id)) {
      // Loại bỏ người dùng khỏi danh sách người dùng đang online
      onlineUsersMap.get(socket.id).delete(username);

      io.emit('user-leave', `${username} đã rời đoạn chat`);

      // Cập nhật trạng thái đăng nhập của người dùng trong MongoDB
      if (db) {
        db.collection('users').updateOne(
          { username },
          { $set: { isLoggedIn: false } },
          (err, result) => {
            if (err) {
              console.error(
                `Error updating user ${username} status:`,
                err
              );
            } else {
              console.log(`User ${username} logged out`);
            }
          }
        );
      } else {
        console.error('Database connection not available');
      }

      // Gửi thông báo đến client hoặc ngắt kết nối
      io.to(socket.id).emit('logged_out'); // Gửi chỉ đến socket hiện tại
    }

    // Cập nhật danh sách người dùng trực tuyến cho tất cả client
    const allOnlineUsers = Array.from(onlineUsersMap.values()).flatMap(
      (users) => Array.from(users)
    );
    io.emit('online-users', Array.from(allOnlineUsers));
  });
});
// Thêm route để phục vụ các tệp tạm thời
app.use('/temp', express.static(tempDir));

server.listen(8000, () => {
    console.log('Server is running on port 8000');
});