import os
import re
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

def clean_markdown_for_pdf(text: str) -> str:
    """Cleaner to escape XML entities and convert common markdown tags to ReportLab tags."""
    # First escape XML specials
    text = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    # Re-enable specific tags we want
    # Convert bold **text** to <b>text</b>
    text = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', text)
    # Convert italic *text* to <i>text</i>
    text = re.sub(r'\*(.*?)\*', r'<i>\1</i>', text)
    # Convert code `code` to font
    text = re.sub(r'`(.*?)`', r'<font face="Courier" color="#2563EB">\1</font>', text)
    # Convert markdown links [text](url) to text (url)
    text = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<u>\1</u> (\2)', text)
    return text

def export_report_to_pdf(report_markdown: str, output_path: str = "research_report.pdf") -> str:
    """Generates a styled, publication-ready PDF from markdown report text, gracefully handling Mermaid diagrams."""
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        rightMargin=54,
        leftMargin=54,
        topMargin=54,
        bottomMargin=54
    )
    
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        textColor=colors.HexColor('#1E293B'),
        spaceAfter=14
    )
    
    h2_style = ParagraphStyle(
        'DocH2',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=colors.HexColor('#2563EB'),
        spaceBefore=12,
        spaceAfter=6
    )
    
    body_style = ParagraphStyle(
        'DocBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=colors.HexColor('#334155'),
        spaceAfter=5
    )

    code_style = ParagraphStyle(
        'DocCode',
        parent=styles['Code'],
        fontName='Courier',
        fontSize=7.5,
        leading=10,
        textColor=colors.HexColor('#0F172A'),
        backColor=colors.HexColor('#F8FAFC'),
        borderColor=colors.HexColor('#E2E8F0'),
        borderWidth=0.5,
        borderPadding=3,
        spaceAfter=3
    )

    story = []
    lines = report_markdown.split("\n")
    in_code_block = False
    is_mermaid = False
    
    for line in lines:
        stripped = line.strip()
        if not stripped:
            if not in_code_block:
                story.append(Spacer(1, 4))
            continue
            
        if stripped.startswith("```"):
            if not in_code_block:
                in_code_block = True
                is_mermaid = "mermaid" in stripped.lower()
                label = "📊 Architectural System Diagram (Mermaid Specification):" if is_mermaid else "Code Specification:"
                story.append(Paragraph(f"<b>{label}</b>", body_style))
            else:
                in_code_block = False
                is_mermaid = False
                story.append(Spacer(1, 4))
            continue
            
        if in_code_block:
            escaped_code = stripped.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            story.append(Paragraph(escaped_code, code_style))
            continue
            
        if stripped.startswith("# "):
            clean_text = clean_markdown_for_pdf(stripped[2:])
            story.append(Paragraph(clean_text, title_style))
        elif stripped.startswith("## ") or stripped.startswith("### "):
            clean_text = clean_markdown_for_pdf(stripped.lstrip("#").strip())
            story.append(Paragraph(clean_text, h2_style))
        else:
            clean_text = clean_markdown_for_pdf(stripped)
            try:
                story.append(Paragraph(clean_text, body_style))
            except Exception:
                safe_text = stripped.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                story.append(Paragraph(safe_text, body_style))

    doc.build(story)
    return output_path
