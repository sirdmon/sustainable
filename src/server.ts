import express = require('express')
import validUrl from './helpers/validUrl'
import {Queue, QueueEvents} from 'bullmq'
const Redis = require('ioredis')
import Runner from './runner/runner';
import { safeReject } from './helpers/safeReject';
const bodyParser = require('body-parser')


export default class App{

    _ENV='dev'
    _port:number;
    _runner:any;

    constructor(){
        if(this._ENV==='prod'){
            this._port=7120
        } else if(this._ENV ==='dev'){
            this._port=7200
        } else{
            console.log('ENV is unknown, exit...');
            process.exit(1)
            
        }

    }

    async init(){

        //launch express server

        try{
        const app = express()
        app.use(bodyParser.urlencoded({extended: true}));
        app.use(bodyParser.json());
        app.listen(this._port, 'localhost', ()=> console.log('Server running on port :', this._port))

        //launch redis server
        const connection = new Redis()
        //launch new Queue
        const queue = new Queue('main', {connection})

        //launch runner
        const runner=new Runner()
        this._runner=runner
        await runner.init()
        //launch listeners
        
       this._listeners(app, queue)
        }
       catch(error){
           safeReject(error)
       }

    }

    _listeners(app:express.Application, queue:Queue){

        const queueEvents = new QueueEvents('main')

        app.get('/health', (_,res)=>{
            res.sendStatus(200)
        })
        app.post('/service/add', async (req,res) => {
            const {url} = req.body
            if(!validUrl(url)){
                res.status(400).send({status:'error'})
            }
            const job = await queue.add('audit', {
                url:url
            })

            const _jobId = job.id
  

            queueEvents.on('completed', ({ jobId, returnvalue }) => {
                if(_jobId ===jobId){
                    res.status(200).send({result:returnvalue})
                }
            });
            queueEvents.on('failed', ({ jobId, failedReason }) => {
                if(_jobId === jobId){
                    res.send(500).json(failedReason)
                }
			    
			});

         })

         app.get('/service/close', async (req,res)=>{
             //gracefully close
             await Promise.all([
                 queue.close(),
                  queue.disconnect(),
                   this._runner.shutdown()
                ])

             res.sendStatus(200)
         })
        
    }
}