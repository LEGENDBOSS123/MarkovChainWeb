var formatter = new Intl.NumberFormat("en-US");

class MarkovChain {
    constructor(options) {
        this.chain = options?.chain ?? new Map();
        this.order = options?.order ?? 3;
        this.minOrder = options?.minOrder ?? 1;
        this.nextOrder = options?.nextOrder ?? 3;
        this.stepDown = options?.stepDown ?? 1;
        this.stopCharacters = options?.stopCharacters ?? [".", "!", "?"];
    }

    *getNgrams(text, order, nextOrder) {
        for (let i = 0; i < text.length - order - nextOrder + 1; i += Math.max(1, Math.floor(nextOrder))) {
            yield [text.substring(i, i + order), text.substring(i + order, i + order + nextOrder)];
        }
    }

    train(textData, clean, order = this.order, nextOrder = this.nextOrder) {
        if (order <= this.minOrder - 1) return;
        var ngrams = this.getNgrams(textData, order, nextOrder);
        var i = 0;
        for (var ngram of ngrams) {
            i++;
            if (!this.chain.has(ngram[0])) {
                this.chain.set(ngram[0], { count: 0, next: {} });
            }
            var current = this.chain.get(ngram[0]);
            current.count++;
            if (!current.next[ngram[1]]) {
                current.next[ngram[1]] = 0;
            }
            current.next[ngram[1]]++;
        }
        return this.train(textData, clean, order - this.stepDown, nextOrder);
    }

    predictNext(text, order = this.order) {
        if (order <= this.minOrder - this.stepDown) return null;
        var current = this.chain.get(text.substring(text.length - order, text.length));
        if (!current) {
            return this.predictNext(text, order - this.stepDown);
        }
        var next = current.next;
        var random = Math.floor(Math.random() * current.count);
        for (var key in next) {
            random -= next[key];
            if (random <= 0) return key;
        }
        return this.predictNext(text, order - this.stepDown);
    }
    
    predictUntil(text, stopArray = this.stopCharacters) {
        var result = text;
        while (true) {
            var prediction = this.predictNext(result);
            if (!prediction) break;
            
            var stop = false;
            for (var letter of prediction) {
                result += letter;
                if (stopArray.some(c => result.endsWith(c))) {
                    stop = true;
                    break;
                }
            }
            if (stop) break;
        }
        return result.substring(text.length);
    }

    static fromJSON(json) {
        return new MarkovChain({
            order: json.order,
            minOrder: json.minOrder,
            nextOrder: json.nextOrder,
            stopCharacters: json.stopCharacters,
            chain: new Map(json.chain),
            stepDown: json.stepDown
        });
    }
}


const messageWindow = document.getElementById('message-window');
const inputForm = document.getElementById('input-form');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const statusDisplay = document.getElementById('status');

let markovChain;

async function loadModel() {
    try {
        const response = await fetch('model.json');
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const modelData = await response.json();
        return MarkovChain.fromJSON(modelData);
    } catch (error) {
        console.error("Failed to load Markov Chain model:", error);
        statusDisplay.textContent = "Error: Could not load model.";
        statusDisplay.style.color = "#ff4d4d";
        return null;
    }
}

function addMessage(text, sender) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', `${sender}-message`);
    messageElement.textContent = text;
    messageWindow.appendChild(messageElement);
    messageWindow.scrollTop = messageWindow.scrollHeight;
}

inputForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const messageText = userInput.value.trim();

    if (messageText && markovChain) {
        addMessage(messageText, 'user');
        userInput.value = '';

        setTimeout(() => {
            const botResponse = markovChain.predictUntil(messageText.toLowerCase());
            console.log(botResponse);
            addMessage(messageText + (botResponse), 'bot');
        });
    }
});


document.addEventListener('DOMContentLoaded', async () => {
    markovChain = await loadModel();

    if (markovChain) {
        statusDisplay.textContent = 'Model loaded successfully!';
        userInput.disabled = false;
        sendButton.disabled = false;
        userInput.placeholder = "Type your message...";
        addMessage("Hello! I'm a chatbot powered by a Markov Chain. I will autocomplete your text!", "bot");
    }
});