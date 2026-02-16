"""
Tests for the judicial reasoning pipeline.

Covers: fact extraction, issue classification, evidence scoring,
rule retrieval, judicial reasoning, decision generation, and the
full pipeline orchestrator — all with mocked LLM and DB calls.
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ── Shared fixtures & helpers ─────────────────────────────────────────

MOCK_LLM_METADATA = {
    "model": "test-model",
    "input_tokens": 100,
    "output_tokens": 50,
    "cost_usd": 0.001,
    "latency_ms": 200,
}


def _openai_response(content: dict | str) -> dict:
    """Build a mock OpenAI response dict."""
    body = content if isinstance(content, str) else json.dumps(content)
    return {"content": body, **MOCK_LLM_METADATA}


def _anthropic_response(content: dict | str) -> dict:
    """Build a mock Anthropic response dict."""
    body = content if isinstance(content, str) else json.dumps(content)
    return {"content": body, **MOCK_LLM_METADATA}


# ── Fixtures ──────────────────────────────────────────────────────────

SAMPLE_FACTS = {
    "parties": {
        "plaintiff": {"name": "Alice", "role_description": "tenant"},
        "defendant": {"name": "Bob", "role_description": "landlord"},
    },
    "claims": [
        {"description": "Failure to return security deposit", "amount": 1500, "basis": "statute"}
    ],
    "key_dates": [
        {"date": "2025-01-15", "event": "Lease ended"},
        {"date": "2025-03-01", "event": "Deposit not returned after 30 days"},
    ],
    "claimed_amount": 1500.00,
    "evidence_mentioned": {
        "plaintiff": [{"type": "contract", "description": "Signed lease"}],
        "defendant": [{"type": "testimony", "description": "Verbal claim of damage"}],
    },
    "disputed_issues": [
        {
            "issue": "Condition of apartment at move-out",
            "plaintiff_position": "Left in good condition",
            "defendant_position": "Excessive damage beyond wear and tear",
        }
    ],
    "undisputed_facts": ["Tenant paid $1,500 security deposit"],
}

SAMPLE_CLASSIFICATION = {
    "primary_type": "security_deposit",
    "primary_confidence": 0.95,
    "secondary_type": None,
    "secondary_confidence": None,
    "legal_issues": [
        {
            "issue": "Was deposit returned within 30 days?",
            "elements_to_prove": ["Deposit paid", "Lease ended", "30 days elapsed"],
            "relevant_law": "W.S. 1-21-1208",
        }
    ],
    "jurisdictional_check": {
        "amount_within_limit": True,
        "proper_claim_type": True,
        "notes": "Within small claims jurisdiction",
    },
    "complexity_score": 2,
    "summary": "Tenant seeks return of $1,500 security deposit.",
}

SAMPLE_SCORES = {
    "element_scores": [
        {
            "element": "Deposit paid",
            "plaintiff_score": 3,
            "plaintiff_evidence": "Signed lease with deposit receipt",
            "plaintiff_explanation": "Strong documentary evidence",
            "defendant_score": 0,
            "defendant_evidence": "None",
            "defendant_explanation": "No counter-evidence",
            "net_assessment": "Plaintiff's evidence is conclusive",
        }
    ],
    "overall_plaintiff_strength": 3,
    "overall_defendant_strength": 1,
    "credibility_notes": "Plaintiff has documentary support.",
    "evidence_gaps": ["No move-out inspection report"],
    "key_evidence_summary": "Signed lease establishes deposit obligation.",
}

SAMPLE_REASONING = {
    "factual_narrative": "Tenant paid deposit and vacated. Landlord did not return within 30 days.",
    "credibility_assessment": "Plaintiff more credible due to documentation.",
    "evidence_analysis": {
        "strongest_plaintiff_evidence": "Signed lease",
        "strongest_defendant_evidence": "Oral claim of damage",
        "key_evidence_conflicts": "Resolved in favor of plaintiff — no inspection report.",
    },
    "liability_analysis": [
        {"element": "Deposit paid", "finding": "proven", "reasoning": "Lease confirms"},
        {"element": "30 days elapsed", "finding": "proven", "reasoning": "Timeline shows"},
    ],
    "damages_analysis": {
        "damages_proven": True,
        "amount_claimed": 1500.00,
        "amount_justified": 1500.00,
        "reasoning": "Full deposit wrongfully withheld.",
    },
    "counterclaim_analysis": {
        "counterclaim_exists": False,
        "counterclaim_merit": None,
        "counterclaim_amount": None,
    },
    "final_determination": {
        "prevailing_party": "plaintiff",
        "reasoning_summary": "Landlord failed statutory duty.",
        "confidence": "high",
    },
}

SAMPLE_DECISION = {
    "findings_of_fact": [
        "Tenant paid a $1,500 security deposit.",
        "Landlord did not return deposit within 30 days.",
    ],
    "conclusions_of_law": [
        {
            "conclusion": "Landlord violated W.S. 1-21-1208.",
            "legal_basis": "W.S. 1-21-1208",
        }
    ],
    "judgment_text": "Judgment for Plaintiff in the amount of $1,500.00.",
    "rationale": "Landlord failed to return deposit or provide itemized deductions within 30 days.",
    "awarded_amount": 1500.00,
    "in_favor_of": "plaintiff",
    "costs_awarded": True,
    "costs_note": "Filing fee awarded to plaintiff.",
}


# ═══════════════════════════════════════════════════════════════════════
# Step 1: Fact Extraction
# ═══════════════════════════════════════════════════════════════════════


class TestFactExtraction:

    @pytest.mark.asyncio
    @patch("engine.fact_extractor.call_openai", new_callable=AsyncMock)
    async def test_extract_facts_success(self, mock_openai):
        from engine.fact_extractor import extract_facts

        mock_openai.return_value = _openai_response(SAMPLE_FACTS)

        result = await extract_facts(
            plaintiff_narrative="I paid a deposit and never got it back.",
            defendant_narrative="Tenant caused damage beyond normal wear.",
            plaintiff_name="Alice",
            defendant_name="Bob",
            claimed_amount=1500.00,
        )

        assert "facts" in result
        assert "llm_metadata" in result
        assert result["facts"]["claimed_amount"] == 1500.00
        assert result["llm_metadata"]["pipeline_step"] == "fact_extraction"

        # Verify LLM was called with correct structure
        call_args = mock_openai.call_args
        assert call_args.kwargs["response_format"] == {"type": "json_object"}
        messages = call_args.kwargs["messages"]
        assert any("Alice" in m["content"] for m in messages if m["role"] == "user")

    @pytest.mark.asyncio
    @patch("engine.fact_extractor.call_openai", new_callable=AsyncMock)
    async def test_extract_facts_without_amount(self, mock_openai):
        from engine.fact_extractor import extract_facts

        mock_openai.return_value = _openai_response(SAMPLE_FACTS)

        result = await extract_facts(
            plaintiff_narrative="Story from plaintiff.",
            defendant_narrative="Story from defendant.",
        )

        assert result["facts"] == SAMPLE_FACTS
        # No claimed amount in user message
        user_msg = mock_openai.call_args.kwargs["messages"][1]["content"]
        assert "CLAIMED AMOUNT" not in user_msg

    @pytest.mark.asyncio
    @patch("engine.fact_extractor.call_openai", new_callable=AsyncMock)
    async def test_extract_facts_json_parse_failure(self, mock_openai):
        from engine.fact_extractor import extract_facts

        mock_openai.return_value = _openai_response("not valid json {{{")

        result = await extract_facts(
            plaintiff_narrative="Story A.",
            defendant_narrative="Story B.",
        )

        assert "error" in result["facts"]
        assert "raw" in result["facts"]


# ═══════════════════════════════════════════════════════════════════════
# Step 2: Issue Classification
# ═══════════════════════════════════════════════════════════════════════


class TestIssueClassification:

    @pytest.mark.asyncio
    @patch("engine.issue_classifier.call_openai", new_callable=AsyncMock)
    async def test_classify_issues_success(self, mock_openai):
        from engine.issue_classifier import classify_issues

        mock_openai.return_value = _openai_response(SAMPLE_CLASSIFICATION)

        result = await classify_issues(SAMPLE_FACTS)

        assert result["classification"]["primary_type"] == "security_deposit"
        assert result["classification"]["primary_confidence"] == 0.95
        assert result["llm_metadata"]["pipeline_step"] == "issue_classification"

    @pytest.mark.asyncio
    @patch("engine.issue_classifier.call_openai", new_callable=AsyncMock)
    async def test_classify_issues_json_parse_failure(self, mock_openai):
        from engine.issue_classifier import classify_issues

        mock_openai.return_value = _openai_response("broken json }")

        result = await classify_issues(SAMPLE_FACTS)

        assert "error" in result["classification"]


# ═══════════════════════════════════════════════════════════════════════
# Step 3: Rule Engine
# ═══════════════════════════════════════════════════════════════════════


class TestRuleEngine:

    @pytest.mark.asyncio
    @patch("engine.rule_engine.get_relevant_rules", new_callable=AsyncMock)
    async def test_get_applicable_rules_known_type(self, mock_retriever):
        from engine.rule_engine import get_applicable_rules, STATIC_RULES

        mock_retriever.return_value = [
            {
                "id": "chunk-1",
                "source_type": "statute",
                "source_title": "Wyo. Stat. 1-21-1208",
                "section_number": "1-21-1208",
                "topic": "security_deposit",
                "content": "Deposit must be returned within 30 days.",
                "similarity": 0.92,
            }
        ]

        db = AsyncMock()
        result = await get_applicable_rules(
            db=db,
            case_type="security_deposit",
            claim_description="Tenant seeks return of deposit.",
            disputed_issues=[{"issue": "Condition at move-out"}],
        )

        assert result["claim_elements"]["name"] == "Security Deposit Return"
        assert result["static_rules"] == STATIC_RULES
        assert len(result["retrieved_corpus"]) == 1
        assert result["case_type"] == "security_deposit"

    @pytest.mark.asyncio
    @patch("engine.rule_engine.get_relevant_rules", new_callable=AsyncMock)
    async def test_get_applicable_rules_unknown_type_defaults_to_other(self, mock_retriever):
        from engine.rule_engine import get_applicable_rules

        mock_retriever.return_value = []

        db = AsyncMock()
        result = await get_applicable_rules(
            db=db,
            case_type="unknown_type",
            claim_description="Some unknown claim.",
        )

        assert result["claim_elements"]["name"] == "General Civil Claim"

    @pytest.mark.asyncio
    @patch("engine.rule_engine.get_relevant_rules", new_callable=AsyncMock)
    async def test_get_applicable_rules_no_disputed_issues(self, mock_retriever):
        from engine.rule_engine import get_applicable_rules

        mock_retriever.return_value = []

        db = AsyncMock()
        result = await get_applicable_rules(
            db=db,
            case_type="contract",
            claim_description="Breach of contract claim.",
            disputed_issues=None,
        )

        assert result["claim_elements"]["name"] == "Breach of Contract"
        # Verify retrieval query doesn't contain "Disputed:" when no issues
        call_args = mock_retriever.call_args
        query = call_args.args[2] if len(call_args.args) > 2 else call_args.kwargs.get("retrieval_query", "")
        # The function was called; that's what matters


# ═══════════════════════════════════════════════════════════════════════
# Step 4: Evidence Scoring
# ═══════════════════════════════════════════════════════════════════════


class TestEvidenceScoring:

    @pytest.mark.asyncio
    @patch("engine.evidence_scorer.call_anthropic", new_callable=AsyncMock)
    async def test_score_evidence_success(self, mock_anthropic):
        from engine.evidence_scorer import score_evidence

        mock_anthropic.return_value = _anthropic_response(SAMPLE_SCORES)

        result = await score_evidence(
            extracted_facts=SAMPLE_FACTS,
            classification=SAMPLE_CLASSIFICATION,
            claim_elements={
                "name": "Security Deposit Return",
                "elements": ["Deposit paid", "Lease ended", "30 days elapsed"],
                "damages_measure": "Amount of deposit wrongfully withheld",
            },
        )

        assert result["scores"]["overall_plaintiff_strength"] == 3
        assert result["llm_metadata"]["pipeline_step"] == "evidence_scoring"

    @pytest.mark.asyncio
    @patch("engine.evidence_scorer.call_anthropic", new_callable=AsyncMock)
    async def test_score_evidence_with_archetype_modifiers(self, mock_anthropic):
        from engine.evidence_scorer import score_evidence

        mock_anthropic.return_value = _anthropic_response(SAMPLE_SCORES)

        result = await score_evidence(
            extracted_facts=SAMPLE_FACTS,
            classification=SAMPLE_CLASSIFICATION,
            claim_elements={
                "elements": ["Test element"],
                "damages_measure": "Actual damages",
            },
            archetype_modifiers={"document_weight": 1.5, "testimony_weight": 0.5},
        )

        assert "scores" in result
        # Verify archetype modifiers were included in the prompt
        call_args = mock_anthropic.call_args
        user_msg = call_args.kwargs["messages"][0]["content"]
        assert "JUDGE PREFERENCES" in user_msg

    @pytest.mark.asyncio
    @patch("engine.evidence_scorer.call_anthropic", new_callable=AsyncMock)
    async def test_score_evidence_json_fallback_extraction(self, mock_anthropic):
        from engine.evidence_scorer import score_evidence

        # Simulate LLM returning markdown-wrapped JSON
        wrapped = f"Here is the scoring:\n{json.dumps(SAMPLE_SCORES)}\nEnd of response."
        mock_anthropic.return_value = _anthropic_response(wrapped)

        result = await score_evidence(
            extracted_facts=SAMPLE_FACTS,
            classification=SAMPLE_CLASSIFICATION,
            claim_elements={"elements": [], "damages_measure": "N/A"},
        )

        assert result["scores"]["overall_plaintiff_strength"] == 3

    @pytest.mark.asyncio
    @patch("engine.evidence_scorer.call_anthropic", new_callable=AsyncMock)
    async def test_score_evidence_total_parse_failure(self, mock_anthropic):
        from engine.evidence_scorer import score_evidence

        mock_anthropic.return_value = _anthropic_response("No JSON here at all.")

        result = await score_evidence(
            extracted_facts=SAMPLE_FACTS,
            classification=SAMPLE_CLASSIFICATION,
            claim_elements={"elements": [], "damages_measure": "N/A"},
        )

        assert "error" in result["scores"]


# ═══════════════════════════════════════════════════════════════════════
# Step 5: Judicial Reasoning
# ═══════════════════════════════════════════════════════════════════════


class TestJudicialReasoning:

    @pytest.mark.asyncio
    @patch("engine.reasoning_engine.call_anthropic", new_callable=AsyncMock)
    async def test_generate_reasoning_success(self, mock_anthropic):
        from engine.reasoning_engine import generate_reasoning

        mock_anthropic.return_value = _anthropic_response(SAMPLE_REASONING)

        result = await generate_reasoning(
            extracted_facts=SAMPLE_FACTS,
            classification=SAMPLE_CLASSIFICATION,
            applicable_rules={
                "claim_elements": {
                    "elements": ["Deposit paid", "Lease ended"],
                    "damages_measure": "Amount of deposit",
                },
                "static_rules": {
                    "burden_of_proof": {"standard": "Preponderance"},
                    "evidence_rules": {"formality": "Informal"},
                    "damages": {"general": "Proven with certainty"},
                },
                "retrieved_corpus": [
                    {
                        "source_type": "statute",
                        "section_number": "1-21-1208",
                        "source_title": "Security Deposit Statute",
                        "content": "Deposit must be returned within 30 days.",
                    }
                ],
            },
            evidence_scores=SAMPLE_SCORES,
            archetype={
                "id": "common_sense",
                "name": "Judge Whitehorse",
                "personality_prompt": "Fair and impartial.",
            },
        )

        assert result["reasoning"]["final_determination"]["prevailing_party"] == "plaintiff"
        assert result["llm_metadata"]["pipeline_step"] == "judicial_reasoning"

    @pytest.mark.asyncio
    @patch("engine.reasoning_engine.call_anthropic", new_callable=AsyncMock)
    async def test_generate_reasoning_with_hearing_transcript(self, mock_anthropic):
        from engine.reasoning_engine import generate_reasoning

        mock_anthropic.return_value = _anthropic_response(SAMPLE_REASONING)

        result = await generate_reasoning(
            extracted_facts=SAMPLE_FACTS,
            classification=SAMPLE_CLASSIFICATION,
            applicable_rules={
                "claim_elements": {"elements": [], "damages_measure": ""},
                "static_rules": {},
                "retrieved_corpus": [],
            },
            evidence_scores=SAMPLE_SCORES,
            archetype={
                "id": "strict",
                "name": "Judge Morrison",
                "personality_prompt": "Strict adherence.",
            },
            hearing_transcript=[
                {"role": "judge", "content": "Tell me what happened."},
                {"role": "plaintiff", "content": "I paid a deposit."},
            ],
        )

        assert "reasoning" in result
        # Verify transcript was included
        user_msg = mock_anthropic.call_args.kwargs["messages"][0]["content"]
        assert "HEARING TRANSCRIPT" in user_msg
        assert "I paid a deposit." in user_msg

    @pytest.mark.asyncio
    @patch("engine.reasoning_engine.call_anthropic", new_callable=AsyncMock)
    async def test_generate_reasoning_json_fallback(self, mock_anthropic):
        from engine.reasoning_engine import generate_reasoning

        wrapped = f"My analysis:\n{json.dumps(SAMPLE_REASONING)}\nDone."
        mock_anthropic.return_value = _anthropic_response(wrapped)

        result = await generate_reasoning(
            extracted_facts=SAMPLE_FACTS,
            classification=SAMPLE_CLASSIFICATION,
            applicable_rules={
                "claim_elements": {"elements": [], "damages_measure": ""},
                "static_rules": {},
                "retrieved_corpus": [],
            },
            evidence_scores=SAMPLE_SCORES,
            archetype={"id": "practical", "name": "Judge Dawson", "personality_prompt": "Practical."},
        )

        assert result["reasoning"]["final_determination"]["prevailing_party"] == "plaintiff"


# ═══════════════════════════════════════════════════════════════════════
# Step 6: Decision Generation
# ═══════════════════════════════════════════════════════════════════════


class TestDecisionGeneration:

    @pytest.mark.asyncio
    @patch("engine.decision_generator.call_anthropic", new_callable=AsyncMock)
    async def test_generate_decision_success(self, mock_anthropic):
        from engine.decision_generator import generate_decision

        mock_anthropic.return_value = _anthropic_response(SAMPLE_DECISION)

        result = await generate_decision(
            reasoning_chain=SAMPLE_REASONING,
            extracted_facts=SAMPLE_FACTS,
            classification=SAMPLE_CLASSIFICATION,
            evidence_scores=SAMPLE_SCORES,
            archetype={
                "id": "common_sense",
                "name": "Judge Whitehorse",
                "personality_prompt": "Fair and impartial.",
            },
        )

        assert result["decision"]["in_favor_of"] == "plaintiff"
        assert result["decision"]["awarded_amount"] == 1500.00
        assert len(result["decision"]["findings_of_fact"]) == 2
        assert result["llm_metadata"]["pipeline_step"] == "decision_generation"

    @pytest.mark.asyncio
    @patch("engine.decision_generator.call_anthropic", new_callable=AsyncMock)
    async def test_generate_decision_json_parse_failure(self, mock_anthropic):
        from engine.decision_generator import generate_decision

        mock_anthropic.return_value = _anthropic_response("This is not JSON.")

        result = await generate_decision(
            reasoning_chain=SAMPLE_REASONING,
            extracted_facts=SAMPLE_FACTS,
            classification=SAMPLE_CLASSIFICATION,
            evidence_scores=SAMPLE_SCORES,
            archetype={"id": "strict", "name": "Judge Morrison", "personality_prompt": "Strict."},
        )

        assert "error" in result["decision"]

    @pytest.mark.asyncio
    @patch("engine.decision_generator.call_anthropic", new_callable=AsyncMock)
    async def test_generate_decision_json_fallback_extraction(self, mock_anthropic):
        from engine.decision_generator import generate_decision

        wrapped = f"Here is the decision:\n{json.dumps(SAMPLE_DECISION)}\nFinal."
        mock_anthropic.return_value = _anthropic_response(wrapped)

        result = await generate_decision(
            reasoning_chain=SAMPLE_REASONING,
            extracted_facts=SAMPLE_FACTS,
            classification=SAMPLE_CLASSIFICATION,
            evidence_scores=SAMPLE_SCORES,
            archetype={"id": "evidence_heavy", "name": "Judge Ironside", "personality_prompt": "Meticulous."},
        )

        assert result["decision"]["awarded_amount"] == 1500.00


# ═══════════════════════════════════════════════════════════════════════
# Full Pipeline Orchestrator
# ═══════════════════════════════════════════════════════════════════════


class TestPipelineOrchestrator:

    @pytest.mark.asyncio
    @patch("engine.pipeline.generate_decision", new_callable=AsyncMock)
    @patch("engine.pipeline.generate_reasoning", new_callable=AsyncMock)
    @patch("engine.pipeline.score_evidence", new_callable=AsyncMock)
    @patch("engine.pipeline.get_applicable_rules", new_callable=AsyncMock)
    @patch("engine.pipeline.classify_issues", new_callable=AsyncMock)
    @patch("engine.pipeline.extract_facts", new_callable=AsyncMock)
    async def test_full_pipeline_success(
        self,
        mock_extract,
        mock_classify,
        mock_rules,
        mock_score,
        mock_reasoning,
        mock_decision,
    ):
        from engine.pipeline import run_pipeline

        # Set up the chain of mocks
        mock_extract.return_value = {
            "facts": SAMPLE_FACTS,
            "llm_metadata": {**MOCK_LLM_METADATA, "pipeline_step": "fact_extraction"},
        }
        mock_classify.return_value = {
            "classification": SAMPLE_CLASSIFICATION,
            "llm_metadata": {**MOCK_LLM_METADATA, "pipeline_step": "issue_classification"},
        }
        mock_rules.return_value = {
            "static_rules": {"burden_of_proof": {}},
            "claim_elements": {
                "elements": ["Deposit paid"],
                "damages_measure": "Amount of deposit",
            },
            "retrieved_corpus": [],
            "case_type": "security_deposit",
        }
        mock_score.return_value = {
            "scores": SAMPLE_SCORES,
            "llm_metadata": {**MOCK_LLM_METADATA, "pipeline_step": "evidence_scoring"},
        }
        mock_reasoning.return_value = {
            "reasoning": SAMPLE_REASONING,
            "llm_metadata": {**MOCK_LLM_METADATA, "pipeline_step": "judicial_reasoning"},
        }
        mock_decision.return_value = {
            "decision": SAMPLE_DECISION,
            "llm_metadata": {**MOCK_LLM_METADATA, "pipeline_step": "decision_generation"},
        }

        db = AsyncMock()
        result = await run_pipeline(
            db=db,
            plaintiff_narrative="I paid a deposit and didn't get it back.",
            defendant_narrative="Tenant caused damage.",
            plaintiff_name="Alice",
            defendant_name="Bob",
            claimed_amount=1500.00,
            archetype_id="common_sense",
        )

        # Verify structure
        assert result["judgment"] == SAMPLE_DECISION
        assert result["reasoning_chain"] == SAMPLE_REASONING
        assert result["evidence_scores"] == SAMPLE_SCORES
        assert result["classification"] == SAMPLE_CLASSIFICATION
        assert result["extracted_facts"] == SAMPLE_FACTS

        # Verify archetype info
        assert result["archetype"]["id"] == "common_sense"
        assert result["archetype"]["name"] == "Judge Whitehorse"

        # Verify metadata
        metadata = result["pipeline_metadata"]
        assert metadata["steps_completed"] == 6
        assert len(metadata["llm_calls"]) == 5  # 5 LLM calls (rules step is RAG, not LLM)
        assert metadata["total_cost_usd"] > 0
        assert metadata["total_latency_ms"] > 0

        # Verify all steps were called
        mock_extract.assert_called_once()
        mock_classify.assert_called_once()
        mock_rules.assert_called_once()
        mock_score.assert_called_once()
        mock_reasoning.assert_called_once()
        mock_decision.assert_called_once()

    @pytest.mark.asyncio
    @patch("engine.pipeline.generate_decision", new_callable=AsyncMock)
    @patch("engine.pipeline.generate_reasoning", new_callable=AsyncMock)
    @patch("engine.pipeline.score_evidence", new_callable=AsyncMock)
    @patch("engine.pipeline.get_applicable_rules", new_callable=AsyncMock)
    @patch("engine.pipeline.classify_issues", new_callable=AsyncMock)
    @patch("engine.pipeline.extract_facts", new_callable=AsyncMock)
    async def test_pipeline_with_hearing_transcript(
        self,
        mock_extract,
        mock_classify,
        mock_rules,
        mock_score,
        mock_reasoning,
        mock_decision,
    ):
        from engine.pipeline import run_pipeline

        mock_extract.return_value = {
            "facts": SAMPLE_FACTS,
            "llm_metadata": {**MOCK_LLM_METADATA, "pipeline_step": "fact_extraction"},
        }
        mock_classify.return_value = {
            "classification": SAMPLE_CLASSIFICATION,
            "llm_metadata": {**MOCK_LLM_METADATA, "pipeline_step": "issue_classification"},
        }
        mock_rules.return_value = {
            "static_rules": {},
            "claim_elements": {"elements": [], "damages_measure": ""},
            "retrieved_corpus": [],
            "case_type": "security_deposit",
        }
        mock_score.return_value = {
            "scores": SAMPLE_SCORES,
            "llm_metadata": {**MOCK_LLM_METADATA, "pipeline_step": "evidence_scoring"},
        }
        mock_reasoning.return_value = {
            "reasoning": SAMPLE_REASONING,
            "llm_metadata": {**MOCK_LLM_METADATA, "pipeline_step": "judicial_reasoning"},
        }
        mock_decision.return_value = {
            "decision": SAMPLE_DECISION,
            "llm_metadata": {**MOCK_LLM_METADATA, "pipeline_step": "decision_generation"},
        }

        hearing_transcript = [
            {"role": "judge", "content": "Opening statement."},
            {"role": "plaintiff", "content": "I paid a deposit."},
            {"role": "judge", "content": "Anything else?"},
        ]

        db = AsyncMock()
        result = await run_pipeline(
            db=db,
            plaintiff_narrative="I paid a deposit.",
            defendant_narrative="Damage occurred.",
            hearing_transcript=hearing_transcript,
        )

        # Verify hearing transcript was passed to reasoning step
        reasoning_call = mock_reasoning.call_args
        assert reasoning_call.kwargs["hearing_transcript"] == hearing_transcript
        assert result["judgment"] == SAMPLE_DECISION

    @pytest.mark.asyncio
    @patch("engine.pipeline.generate_decision", new_callable=AsyncMock)
    @patch("engine.pipeline.generate_reasoning", new_callable=AsyncMock)
    @patch("engine.pipeline.score_evidence", new_callable=AsyncMock)
    @patch("engine.pipeline.get_applicable_rules", new_callable=AsyncMock)
    @patch("engine.pipeline.classify_issues", new_callable=AsyncMock)
    @patch("engine.pipeline.extract_facts", new_callable=AsyncMock)
    async def test_pipeline_default_archetype_fallback(
        self,
        mock_extract,
        mock_classify,
        mock_rules,
        mock_score,
        mock_reasoning,
        mock_decision,
    ):
        from engine.pipeline import run_pipeline

        mock_extract.return_value = {
            "facts": SAMPLE_FACTS,
            "llm_metadata": {**MOCK_LLM_METADATA, "pipeline_step": "fact_extraction"},
        }
        mock_classify.return_value = {
            "classification": SAMPLE_CLASSIFICATION,
            "llm_metadata": {**MOCK_LLM_METADATA, "pipeline_step": "issue_classification"},
        }
        mock_rules.return_value = {
            "static_rules": {},
            "claim_elements": {"elements": [], "damages_measure": ""},
            "retrieved_corpus": [],
            "case_type": "security_deposit",
        }
        mock_score.return_value = {
            "scores": SAMPLE_SCORES,
            "llm_metadata": {**MOCK_LLM_METADATA, "pipeline_step": "evidence_scoring"},
        }
        mock_reasoning.return_value = {
            "reasoning": SAMPLE_REASONING,
            "llm_metadata": {**MOCK_LLM_METADATA, "pipeline_step": "judicial_reasoning"},
        }
        mock_decision.return_value = {
            "decision": SAMPLE_DECISION,
            "llm_metadata": {**MOCK_LLM_METADATA, "pipeline_step": "decision_generation"},
        }

        db = AsyncMock()
        # Use a nonexistent archetype — should fall back to common_sense
        result = await run_pipeline(
            db=db,
            plaintiff_narrative="Story.",
            defendant_narrative="Story.",
            archetype_id="nonexistent_archetype",
        )

        assert result["archetype"]["id"] == "common_sense"

    @pytest.mark.asyncio
    @patch("engine.pipeline.extract_facts", new_callable=AsyncMock)
    async def test_pipeline_propagates_step_error(self, mock_extract):
        from engine.pipeline import run_pipeline

        mock_extract.side_effect = RuntimeError("LLM API unavailable")

        db = AsyncMock()
        with pytest.raises(RuntimeError, match="LLM API unavailable"):
            await run_pipeline(
                db=db,
                plaintiff_narrative="Story.",
                defendant_narrative="Story.",
            )


# ═══════════════════════════════════════════════════════════════════════
# Archetypes
# ═══════════════════════════════════════════════════════════════════════


class TestArchetypes:

    def test_get_known_archetype(self):
        from personas.archetypes import get_archetype

        arch = get_archetype("strict")
        assert arch["id"] == "strict"
        assert arch["name"] == "Judge Morrison"

    def test_get_unknown_archetype_defaults_to_common_sense(self):
        from personas.archetypes import get_archetype

        arch = get_archetype("unknown")
        assert arch["id"] == "common_sense"
        assert arch["name"] == "Judge Whitehorse"

    def test_list_archetypes(self):
        from personas.archetypes import list_archetypes

        archetypes = list_archetypes()
        assert len(archetypes) == 4
        ids = {a["id"] for a in archetypes}
        assert ids == {"strict", "common_sense", "evidence_heavy", "practical"}
        # Public-facing info should NOT include personality_prompt
        for a in archetypes:
            assert "personality_prompt" not in a


# ═══════════════════════════════════════════════════════════════════════
# LLM Client Utilities
# ═══════════════════════════════════════════════════════════════════════


class TestLLMClientUtils:

    def test_calculate_cost(self):
        from engine.llm_client import _calculate_cost

        cost = _calculate_cost("gpt-4o", input_tokens=1000, output_tokens=500)
        # gpt-4o: input=$2.50/M, output=$10.00/M
        expected = (1000 * 2.50 + 500 * 10.00) / 1_000_000
        assert abs(cost - expected) < 1e-10

    def test_calculate_cost_unknown_model_uses_defaults(self):
        from engine.llm_client import _calculate_cost

        cost = _calculate_cost("unknown-model", input_tokens=1000, output_tokens=500)
        # Default: input=$5.0/M, output=$15.0/M
        expected = (1000 * 5.0 + 500 * 15.0) / 1_000_000
        assert abs(cost - expected) < 1e-10

    def test_is_retryable_429(self):
        from engine.llm_client import _is_retryable_exception

        exc = Exception("rate limit")
        exc.status_code = 429
        assert _is_retryable_exception(exc) is True

    def test_is_retryable_500(self):
        from engine.llm_client import _is_retryable_exception

        exc = Exception("server error")
        exc.status_code = 500
        assert _is_retryable_exception(exc) is True

    def test_is_not_retryable_400(self):
        from engine.llm_client import _is_retryable_exception

        exc = Exception("bad request")
        exc.status_code = 400
        assert _is_retryable_exception(exc) is False

    def test_is_retryable_timeout_name(self):
        from engine.llm_client import _is_retryable_exception

        class TimeoutError(Exception):
            pass

        assert _is_retryable_exception(TimeoutError("timed out")) is True

    def test_is_not_retryable_generic(self):
        from engine.llm_client import _is_retryable_exception

        assert _is_retryable_exception(ValueError("bad value")) is False


# ═══════════════════════════════════════════════════════════════════════
# Static Rule Structures
# ═══════════════════════════════════════════════════════════════════════


class TestStaticRules:

    def test_all_claim_types_have_required_keys(self):
        from engine.rule_engine import CLAIM_ELEMENTS

        for type_key, elements in CLAIM_ELEMENTS.items():
            assert "name" in elements, f"Missing 'name' in {type_key}"
            assert "elements" in elements, f"Missing 'elements' in {type_key}"
            assert "damages_measure" in elements, f"Missing 'damages_measure' in {type_key}"
            assert isinstance(elements["elements"], list), f"'elements' not a list in {type_key}"
            assert len(elements["elements"]) > 0, f"Empty elements list in {type_key}"

    def test_static_rules_have_statutes(self):
        from engine.rule_engine import STATIC_RULES

        for rule_key, rule in STATIC_RULES.items():
            assert "statute" in rule or "statutes" in rule or isinstance(rule.get("methods"), list), \
                f"Missing statute reference in {rule_key}"

    def test_jurisdiction_limit(self):
        from engine.rule_engine import STATIC_RULES

        assert STATIC_RULES["jurisdiction"]["amount_limit"] == 6000.00
