require('dotenv').config();
const readline = require('readline');
const crypto = require('crypto');
const { spawn } = require('child_process');
const OpenAIApi = require('openai');

// Set up your OpenAI API key
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ORGANIZATION = process.env.OPENAI_API_ORGANIZATION;


const DEFAULT = '\x1b[0m';
const BLACK = '\x1b[30m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const BRIGHT_GREEN = '\x1b[38;5;10m';
const ROSE = '\x1b[38;5;9m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const MAGENTA = '\x1b[35m';
const CYAN = '\x1b[36m';
const WHITE = '\x1b[37m';

const BLACK_BG = '\x1b[40m';
const RED_BG = '\x1b[41m';
const GREEN_BG = '\x1b[42m';
const YELLOW_BG = '\x1b[43m';
const BLUE_BG = '\x1b[44m';
const MAGENTA_BG = '\x1b[45m';
const CYAN_BG = '\x1b[46m';
const WHITE_BG = '\x1b[47m';

const SPLITTER = MAGENTA+'================================================================================'+DEFAULT;

const openai = new OpenAIApi({
    key: OPENAI_API_KEY
});


let rl;

let isReadlineOpen = false;

let global_messages = [
    {role: 'system', content: `You are an AI agent for CLI shell.
    You are interpreting user's requests in natural language 
    and submitting back to the user's environment a suggetion for a sequence of BASH commands
    to be executed at user's environment in order to satisfy the request. You will be
    explaining in natural language what you are going to execute and how it solves 
    the user's request. You form your responce as follows: <your-description-in-natural-language>|CMD|<first-command-suitable-for-execution>.
    IMPORTANT: DO NOT USE SUBSTRING |CMD| inside the natural language description, only after it!
    CLI shell software at user's side will interpret you response: first it will ask the user if he/she
    agrees to your solution as is and will ask for any amendments from user side, then it will execute the command after |CMD| substring.
    After execution of each command, user's 
    CLI shell will be streaming the command's STDOUT to you as the next chat completions query,
    so that you could analyze the results and decide whether the remaining sequence of commands needs an
    amendment. If so, you suggest the amendment. Proceed further if the user is happy. Remember: you can do
    (with the user permission) anything the user can do him/herself on her machine by running BASH commands.
    However, keep in mind that whatever you command to be executed in the client shell, will not change
    the shell's process context. I.e., use absolute paths in your commands and make sure to run only context independent
    commands between diferent call cycles.
    Also, remember that you cannot handle prompts larger than 4096 points, so try making commands less verbose.
    NOTE: YOU MUST NOT generate responses larger than 4096 symbols! If needed, fragment you original large response into pieces smaller than
    2048 symbols.`},
    {role: 'assistant', content: 'you can list a directory with "ls", read a file with "cat", write a new file with "echo >", etc.'}
];

// Enable unhandled promise rejection warnings
/*process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});*/

function initializeReadline() {

    rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
	prompt: CYAN+process.cwd()+BLUE+' nl-cli> '+BRIGHT_GREEN
    });

    rl.on('line', async (line) => {
	global_messages.push({role: 'user', content: line.trim()});
	try {
    	    const response = await talkToAI(global_messages);
	    const reply = response.choices[0].message.content.trim();
	    global_messages.push({role: 'assistant', content: reply});
	    interpretResponse(reply);
	} catch (error) {
    	    console.error(RED,'Error interacting with OpenAI API:', error.message,DEFAULT);
	    process.exit(0);
	}
    }).on('close', () => {
	isReadlineOpen = false;
    });
    isReadlineOpen = true;
}

function promptUser(){
    if(!isReadlineOpen)
	initializeReadline();
    rl.prompt();
}

process.on('exit', () => {
	console.log(YELLOW,'\nHave a great day!',DEFAULT);
	process.exit(0);
});

function calculateSize(messages) {
    let totalSymbols = 0;

    for (let message of messages) {
//        const content = message.content;
//        const byteSize = Buffer.from(content, 'utf-8').length;
        totalSymbols += message.content.length;
    }

    return totalSymbols;
}

function splitIntoChunks(str, maxLength = 4096) {
    const words = str.split(' ');
    const chunks = [];
    let chunk = "";

    words.forEach(word => {
        if ((chunk + word).length <= maxLength) {
            chunk += word + ' ';
        } else {
            chunks.push(chunk.trim());
            chunk = word + ' ';
        }
    });

    // Push the last chunk if it's not empty
    if (chunk.trim() !== "") {
        chunks.push(chunk.trim());
    }

    return chunks;
}

async function compactLastMessage(messages){
    console.log(SPLITTER);
    console.log(YELLOW,'Compacting last message...',DEFAULT);
    const compactMessages = messages.slice(0, -1);
    const message = messages[messages.length-1];
    const hash = crypto.createHash('sha256').update(message.content).digest('hex');

    const compacting_instruction = {role: 'user', content: `The original message with hash ${hash} that should be here was huge and does not fit into 
	the context window cap. Thus, I am going to feed you with the fragments of this message one by one in
	separate calls, and you are going to write a short summary (not more than 1024 symbols) for each of them. Thus, we are going 
	to replace the original message with short summaries of its fragments and to have higher chances to fit into the context
	size cap`};

    let summary_message = {role: 'assistant', content: `We are considering the first fragment (fragment number 0), 
	there were no previous fragments yet, thus there is no summary yet`};
//    const chunks = message.content.match(/.{1,4096}/g);
    const chunks = splitIntoChunks(message.content);
    compactMessages.push(compacting_instruction);
    for(let i=0;i<chunks.length;i++){
	console.log(SPLITTER);
	console.log(YELLOW,`Processing fragment ${i}...`,DEFAULT);
/*	const fragment_number = {role: 'user', content: 'Currently, I am supplying you with fragment number k='+i+'.'+
	(i>0?'All previous 0...'+(i-1)+` fragments have been already processed and you have provided summary for them. 
	    Now, you will take that previous summary, the fragment number ${i}, and will update your summary accordingly. Thanks!`:'')};*/
//	compactMessages.push(summary_message);
//	compactMessages.push(fragment_number);
	compactMessages.push({role: 'user', content: chunks[i]});
	const response = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: compactMessages
        });
	summary_message.content = `THIS IS SUMMARY FOR ${i}'s FRAGMENT OF ORIGINAL MESSAGE WITH HASH ${hash}: `+response.choices[0].message.content.trim();
	compactMessages[compactMessages.length-1] = Object.assign({}, summary_message);
	console.log(SPLITTER);
	console.log(GREEN,summary_message.content,DEFAULT);
	console.log(YELLOW,'Waiting for 60 seconds',DEFAULT);
	await new Promise(resolve => setTimeout(resolve, 60000));
    };
    compactMessages.push(
	{
	    role: 'user',
	    content: `We have completed processing all chunks for the original message with hash ${hash}. We replaced the original message 
		with summaries of its fragments. Thus, we tried to preserve the idea of the original message within the given context while
		reducing the size of the original message in around four times.`
	}
    );
//    messages[messages.length-1] = summary_message;
    console.log(YELLOW,'Compacted last message...',DEFAULT);
    return compactMessages;
}

async function compactMessages(messages){
    console.log(SPLITTER);
    const size = calculateSize(messages);
    console.log(YELLOW,`Compacting messages of total size ${size}...`,DEFAULT);

    const compacting_instruction = {role: 'user', content: `
	Summarize all the conversation except of the first two and the last message into a single summary of size not exceeding 4096 symbols. Thanks!
    `}

//    console.log("LAST: "+messages[messages.length-1]);
    if(messages[messages.length-1].content.length > 2048*8)messages=await compactLastMessage(messages);

    if(calculateSize(messages)<=2048*10)
	return messages;

    messages.push(compacting_instruction);

    const response = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: messages
    });
    const summary_message = {role: 'assistant', content: `THIS IS SUMMARY FOR THE LARGE CONTEXT: `+response.choices[0].message.content.trim()};
    console.log(SPLITTER);
    console.log(GREEN,summary_message.content,DEFAULT);

    let compacted_messages = [messages[0],messages[1],summary_message,messages[messages.length-1]];

    console.log(YELLOW,'Compacting messages completed',DEFAULT);
    console.log(SPLITTER);
    return compacted_messages;
}

async function talkToAI(messages){
//	console.log(messages);
	if(calculateSize(messages)>2048*10)
	    global_messages = await compactMessages(messages);
//	console.log(global_messages);
        return await openai.chat.completions.create({
            model: 'gpt-4',
            messages: global_messages
        });
}

async function analyzeOutputWithOpenAI(output) {
    try {
        // Use the output as part of your message to OpenAI
        global_messages.push({ role: 'user', content: `The output of the last command was: ${output}. What shall we do next? 
	Suggest the next command if any for execution after |CMD|` });

        const response = await talkToAI(global_messages);

        const reply = response.choices[0].message.content.trim();
        console.log(YELLOW,`Reply:`,GREEN,` ${reply}`,DEFAULT);

        // Append the assistant's reply to the messages array for context
        global_messages.push({ role: 'assistant', content: reply });
	interpretResponse(reply);

        // Prompt the user for the next action or continue processing based on the reply
//	promptUser();

    } catch (error) {
        console.error(RED,'Error interacting with OpenAI API:', error.message, DEFAULT);
	process.exit(0);
    }
}

async function executionError(err) {
    try {
        // Use the output as part of your message to OpenAI
        global_messages.push({ role: 'user', content: `Execution of the last command failed: ${err}. What shell we do next?
	Suggest the next command if any for execution after |CMD|` });

        const response = await talkToAI(global_messages);

        const reply = response.choices[0].message.content.trim();
        console.log(YELLOW,`Reply:`,GREEN,` ${reply}`,DEFAULT);

        // Append the assistant's reply to the messages array for context
        global_messages.push({ role: 'assistant', content: reply });

        // Prompt the user for the next action or continue processing based on the reply
	promptUser();

    } catch (error) {
        console.error(RED,'Error interacting with OpenAI API:', error.message,DEFAULT);
	process.exit(0);
    }
}


async function rejectedByUser(){
		global_messages.push({ role: 'user', content: `I rejected your suggestion and did not execute the command. Ask me what are we doing next.` });

    		const response = await talkToAI(global_messages);

	        const reply = response.choices[0].message.content.trim();
    		console.log(YELLOW,`Reply:`,GREEN,` ${reply}`,DEFAULT);

	        // Append the assistant's reply to the messages array for context
	        global_messages.push({ role: 'assistant', content: reply });

		interpretResponse(reply);

    		// Prompt the user for the next action or continue processing based on the reply
		promptUser();
}

async function interpretResponse(reply){
	
	const [description, instruction] = reply.split('|CMD|');
	let command = (typeof instruction !== 'undefined')?instruction.split('\n')[0].trim():null;
	console.log(YELLOW,`Description:`,GREEN,` ${description.trim()}`,DEFAULT);
	console.log(YELLOW,`Suggested Command(s):`,ROSE,` ${command}`,DEFAULT);
	
	if(!isReadlineOpen)initializeReadline();
	if((typeof instruction !== 'undefined')&&(command.length>0))rl.question(YELLOW+'Do you approve/modify the execution of this command? (default yes, modified command/no) '+BRIGHT_GREEN, (answer) => {
	    try{
	    console.log("ANSWER: "+answer);
	    if(answer.trim() === '')answer = 'yes';
	    if(answer.trim().toLowerCase() === 'no'){
    		console.log(YELLOW,'Command not executed.',DEFAULT);
		rejectedByUser();
		return;
	    }
	    let accumulatedOutput;
	    if(answer.trim().toLowerCase() != 'yes'){
		command = answer;
		accumulatedOutput = "I have modified your command and will execute: "+command+"\n";
	    }
	    else
		accumulatedOutput = "Executing BASH command: "+command+"\n";
	    let stdErr = "";
    		console.log(YELLOW, 'Executing command: ',ROSE,command,YELLOW,'...',DEFAULT);
		console.log(SPLITTER);

		const cmd = `/bin/sh`;
		const args = ['-c', `"${command}"`];

		if(isReadlineOpen)rl.close();

		const child = spawn(command, { shell: true, stdio: ['inherit']});

		child.stdout.on('data', (data) => {
		    const str = data.toString();
	    	    console.log(str);
		    accumulatedOutput += 'STDOUT: '+str;
	        });

		child.stderr.on('data', (data) => {
		    const str = data.toString();
	    	    console.error(RED,str,DEFAULT);
		    accumulatedOutput += 'STDERR: '+str;
		    stdErr+=str;
	        });

		child.on('exit', (code) => {
		    accumulatedOutput += '\n\nPROGRAM TERMINATED. EXIT_CODE: '+code;
		    if(stdErr.length > 0)
			accumulatedOutput += 'STDERR NON-EMPTY. PLEASE CONSIDER THE WHOLE STDERR: '+stdErr;
		    console.log(SPLITTER);
		    console.log(YELLOW,`Child process exited with code ${code}`,DEFAULT);
		    console.log();
		    analyzeOutputWithOpenAI(accumulatedOutput);
		});

/*		exec(cmd, (error, stdout, stderr) => {
    		    if (error) {
        		console.error(`Execution Error: ${error}`);
			executionError(error);
        		return;
    		    }
    		    if (stderr) {
        		console.error(`STDERR: ${stderr}`);
			executionError(stderr);
    		    }

    		    console.log(`STDOUT: ${stdout}`);
    		    // Now, send `stdout` or any other relevant info back to OpenAI for further analysis
    		    analyzeOutputWithOpenAI(stdout);
		});*/
//	    rl.prompt();
	    }catch(err){console.error(err);}
	});else promptUser();
//	initializeReadline();
//	rl.prompt();
}

initializeReadline();
rl.prompt();
