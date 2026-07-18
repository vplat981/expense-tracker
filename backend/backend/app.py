import os
import io
import json
import base64
from datetime import datetime
from flask import Flask, request, jsonify, session
from flask_cors import CORS
from supabase import create_client, Client
from dotenv import load_dotenv
import openai
from PIL import Image
import pytesseract
import re

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'your-secret-key-here')
CORS(app, origins=['http://localhost:5000', 'https://your-frontend-url.onrender.com'])

# Initialize Supabase
supabase_url = os.getenv('SUPABASE_URL')
supabase_key = os.getenv('SUPABASE_KEY')
supabase: Client = create_client(supabase_url, supabase_key)

# Initialize OpenAI
openai.api_key = os.getenv('OPENAI_API_KEY')

# Database tables needed:
# users (id, email, password_hash, created_at)
# expenses (id, user_id, description, amount, category, date, image_url, created_at)

@app.route('/api/register', methods=['POST'])
def register():
    try:
        data = request.json
        email = data.get('email')
        password = data.get('password')
        
        # Register user with Supabase Auth
        response = supabase.auth.sign_up({
            'email': email,
            'password': password
        })
        
        if response.user:
            return jsonify({
                'success': True,
                'message': 'User registered successfully',
                'user': response.user.email
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Registration failed'
            }), 400
            
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 400

@app.route('/api/login', methods=['POST'])
def login():
    try:
        data = request.json
        email = data.get('email')
        password = data.get('password')
        
        response = supabase.auth.sign_in_with_password({
            'email': email,
            'password': password
        })
        
        if response.user:
            session['user_id'] = response.user.id
            return jsonify({
                'success': True,
                'message': 'Login successful',
                'user': response.user.email
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Login failed'
            }), 401
            
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 401

@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True, 'message': 'Logged out'})

@app.route('/api/expenses', methods=['POST'])
def add_expense():
    try:
        data = request.json
        user_id = session.get('user_id')
        
        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401
        
        expense_data = {
            'user_id': user_id,
            'description': data.get('description'),
            'amount': float(data.get('amount')),
            'category': data.get('category', 'Other'),
            'date': data.get('date', datetime.now().isoformat()),
            'image_url': data.get('image_url')
        }
        
        response = supabase.table('expenses').insert(expense_data).execute()
        
        return jsonify({
            'success': True,
            'message': 'Expense added successfully',
            'data': response.data
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 400

@app.route('/api/expenses', methods=['GET'])
def get_expenses():
    try:
        user_id = session.get('user_id')
        
        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401
        
        response = supabase.table('expenses')\
            .select('*')\
            .eq('user_id', user_id)\
            .order('date', desc=True)\
            .execute()
        
        return jsonify({
            'success': True,
            'data': response.data
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 400

@app.route('/api/expenses/<expense_id>', methods=['DELETE'])
def delete_expense(expense_id):
    try:
        user_id = session.get('user_id')
        
        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401
        
        response = supabase.table('expenses')\
            .delete()\
            .eq('id', expense_id)\
            .eq('user_id', user_id)\
            .execute()
        
        return jsonify({
            'success': True,
            'message': 'Expense deleted successfully'
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 400

@app.route('/api/analyze-receipt', methods=['POST'])
def analyze_receipt():
    try:
        user_id = session.get('user_id')
        
        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401
        
        # Get image from request
        image_data = request.json.get('image_data')
        
        if not image_data:
            return jsonify({'error': 'No image provided'}), 400
        
        # Decode base64 image
        if image_data.startswith('data:image'):
            image_data = image_data.split(',')[1]
        
        image_bytes = base64.b64decode(image_data)
        image = Image.open(io.BytesIO(image_bytes))
        
        # Extract text using OCR
        text = pytesseract.image_to_string(image)
        
        # Use OpenAI to parse the receipt
        prompt = f"""
        Analyze this receipt text and extract the following information:
        - Total amount (look for total, amount due, or grand total)
        - Items purchased (list of items)
        - Date (if present)
        - Store name (if present)
        
        Receipt text:
        {text}
        
        Return ONLY a JSON object with the following format:
        {{
            "total": "number",
            "items": ["item1", "item2"],
            "date": "YYYY-MM-DD",
            "store": "store name",
            "category": "Food/Groceries/Shopping/Other"
        }}
        """
        
        response = openai.ChatCompletion.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You are a helpful assistant that extracts information from receipts."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1
        )
        
        parsed_data = json.loads(response.choices[0].message.content)
        
        # Try to find total amount with regex if AI fails
        if not parsed_data.get('total'):
            total_match = re.search(r'Total:?\s*\$?(\d+\.?\d*)', text, re.IGNORECASE)
            if total_match:
                parsed_data['total'] = total_match.group(1)
        
        return jsonify({
            'success': True,
            'data': parsed_data
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 400

@app.route('/api/daily-summary', methods=['GET'])
def get_daily_summary():
    try:
        user_id = session.get('user_id')
        
        if not user_id:
            return jsonify({'error': 'Unauthorized'}), 401
        
        date = request.args.get('date', datetime.now().date().isoformat())
        
        response = supabase.table('expenses')\
            .select('*')\
            .eq('user_id', user_id)\
            .eq('date', date)\
            .execute()
        
        expenses = response.data
        total = sum(exp['amount'] for exp in expenses)
        
        # Group by category
        categories = {}
        for exp in expenses:
            cat = exp.get('category', 'Other')
            categories[cat] = categories.get(cat, 0) + exp['amount']
        
        return jsonify({
            'success': True,
            'data': {
                'total': total,
                'count': len(expenses),
                'categories': categories,
                'expenses': expenses
            }
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': str(e)
        }), 400

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
