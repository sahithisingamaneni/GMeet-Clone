const express = require('express')
const app = express()
const http = require('http')
const server = http.createServer(app)
const socketIO = require('socket.io')
const io = socketIO(server)
const { v4: uuidV4 } = require('uuid')
const { ExpressPeerServer } = require('peer');
const peerServer = ExpressPeerServer(server, {
    debug: true
})
const passport = require('passport')
require('./passport-setup');
const session = require('express-session');


//middleware
app.use(session({ secret: 'cats', resave: false, saveUninitialized: true }));
app.set('view engine', 'ejs')
app.use(express.static('public'))
app.use('/peerjs', peerServer)
app.use(passport.initialize());
app.use(passport.session());

//to store the room information
let ROOM_ID;


app.get('/', (req, res) => {
    ROOM_ID = uuidV4();
    if (req.user) {
        res.render(`home`, { ROOM_ID: ROOM_ID, username: req.user.displayName })
    } else
        res.send(`<h3>You are not logged in. Login to continue.</h3><br><a href="/auth/google">Login with google</a>`)
})

//logging out and destroying the session
app.get('/logout', (req, res) => {
    req.logout();
    req.session = null;
    res.send('<h3>Left the meeting</h3><br><a href="/">Start a new meeting</a>');
})

app.get('/whiteboard', (req, res) => {
    res.render('whiteboard');
})

//to join an existing room
app.get('/:room', (req, res) => {
    ROOM_ID = req.params.room;
    if (req.user) {
        //to prevent using browser back button to join the meeting after logout
        res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
        res.header('Expires', '-1');
        res.header('Pragma', 'no-cache');

        //sending the room.ejs view
        res.render('room', { roomId: ROOM_ID, username: req.user.displayName })
    } else
        res.send(`<h3>You are not logged in. Login to continue.</h3><br><a href="/auth/google">Login with google</a>`)
})


let connections = [];
io.on('connect', (Socket) => {
    connections.push(Socket);
    // console.log(`${Socket.id} has connected`);

    Socket.on('draw', (data) => {
        connections.forEach((con) => {
            if (con.id !== Socket.id)
                con.emit("ondraw", { x: data.x, y: data.y });
        });

    })
    Socket.on('down', (data) => {
        connections.forEach((con) => {
            if (con.id !== Socket.id) {
                con.emit('ondown', { x: data.x, y: data.y })
            };
        });
    });
    Socket.on('disconnect', (reason) => {
        connections = connections.filter((con) => con.id !== Socket.id);
    });
});


//socket code
io.on('connection', (socket) => {
    socket.on('join-room', (roomId, userId) => {
        socket.join(roomId)
        socket.broadcast.to(roomId).emit('user-connected', userId)
    
        socket.on('disconnect', () => {
          socket.broadcast.to(roomId).emit('user-disconnected', userId)
        })
    

        // socket.on('send', data => {
        //     // socket.to(roomId).emit('receive', data)
        //     console.log('send called')
        //     socket.broadcast.emit('receive',data)
        // });
        socket.on('send', data => {
            // io.to(roomId).emit('receive', {message:message, sender : username})
            socket.broadcast.emit('receive', data)
        });
        
        socket.on('left', (userId, roomId) => {
            socket.to(roomId).emit('user-disconnected', userId)
        })
    })
})


//google authentication

app.get('/auth/google/failure', (req, res) => {
    res.send('Could Not Login, Try Again...');
})

app.get('/auth/google',
    passport.authenticate('google', {
        scope:
            ['email', 'profile'],
        prompt: 'select_account' //to allow user to select a different account once logged out
    }
    ));

app.get('/auth/google/redirect',
    passport.authenticate('google', {
        successRedirect: (ROOM_ID) ? `/${ROOM_ID}` : '/',
        failureRedirect: '/auth/google/failure'
    }));

server.listen(process.env.PORT || 3000)